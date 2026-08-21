// app/api/cron/scrape-giddens/route.ts
//
// Vercel Cron endpoint. Daily Giddens Homes Austin Quick Move-In Ready (QMI)
// inventory scrape. One row per buyable QMI home with homeType='showcase'.
//
// Conforms to docs/scraper-template.md (move-in homes cron route).
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
//
// ?strip=1 — deletes ALL existing Giddens showcase rows before upserting.
//   Use for a clean rebuild.

import { NextRequest, NextResponse } from 'next/server';
import { fetchGiddensAustin } from '@/lib/scrapers/giddens';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';
import { neon } from '@neondatabase/serverless';
import { withScraperRun } from '@/lib/with-scraper-run';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 1 REST API call + ~11 upserts + prune.
export const maxDuration = 150;

const SCRAPER_SUBMITTER_NAME = 'Giddens Homes Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-giddens@harmonyone.system';
const BUILDER_NAME = 'Giddens Homes';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');

  if (!isProduction) {
    return { ok: true };
  }

  if (!expected) {
    return { ok: false, reason: 'CRON_SECRET not configured' };
  }
  if (got !== `Bearer ${expected}`) {
    return { ok: false, reason: 'Bad or missing Authorization header' };
  }
  return { ok: true };
}

async function stripExistingShowcase(): Promise<number> {
  const result = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${BUILDER_NAME}
      AND home_type = 'showcase'
      AND external_id IS NOT NULL
    RETURNING id
  `;
  return result.length;
}

async function runScrape(strip: boolean) {
  const startedAt = Date.now();

  let stripped = 0;
  if (strip) {
    try {
      stripped = await stripExistingShowcase();
      console.log(
        `[scrape-giddens] stripped ${stripped} existing showcase rows`,
      );
    } catch (err) {
      console.error(
        '[scrape-giddens] strip failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const { rows, rawCount, skipped } = await fetchGiddensAustin();

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: { title: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId({
        externalId: row.externalId,
        kind: 'listing',
        publication: 'realtyline',
        submittedByName: SCRAPER_SUBMITTER_NAME,
        submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
        builderName: row.builderName,
        title: row.title,
        city: row.city,
        state: row.state,
        description: row.description,
        bedsMin: row.bedsMin,
        bedsMax: row.bedsMax,
        bathsMin: row.bathsMin,
        bathsMax: row.bathsMax,
        sqftMin: row.sqftMin,
        sqftMax: row.sqftMax,
        priceMin: row.priceMin,
        priceMax: row.priceMax,
        flyerPdfUrl: row.flyerPdfUrl,
        sourceUrl: row.sourceUrl,
        thumbnailUrl: row.thumbnailUrl,
        galleryUrls: row.galleryUrls,
        address: row.address,
        readyDate: row.readyDate,
        planName: row.planName,
        communityName: row.communityName,
        homeType: row.homeType,
        extraDetails: row.extraDetails,
      });
      if (result.created) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-giddens] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate homes no longer in the source feed (sold/off-market).
  // GUARDED — never run on an empty scrape so a transient empty response
  // can't wipe the whole set.
  let deactivated = 0;
  if (rows.length > 0 && !strip) {
    deactivated = await deactivateStaleBuilderInventory({
      builderName: BUILDER_NAME,
      homeType: 'showcase',
      activeExternalIds: rows.map((r) => r.externalId),
    });
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      rawCount,
      normalized: rows.length,
      skipped,
      stripped,
      inserted,
      updated,
      deactivated,
      errors,
      elapsedMs,
    },
    errorDetails: errors > 0 ? errorDetails : undefined,
  };
}

async function _GET(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? 'Unauthorized' },
      { status: 401 },
    );
  }

  const strip = new URL(req.url).searchParams.get('strip') === '1';

  try {
    const result = await runScrape(strip);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-giddens] fatal error:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export const GET = withScraperRun('scrape-giddens', _GET);
