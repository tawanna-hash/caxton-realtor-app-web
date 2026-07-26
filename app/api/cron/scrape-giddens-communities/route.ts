// app/api/cron/scrape-giddens-communities/route.ts
//
// Vercel Cron endpoint. Daily Giddens Homes Austin community scrape.
// One row per neighborhood with homeType='community' + structured communityData.
//
// Conforms to docs/community-scraper-template.md §9.
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// ?strip=1 — deletes ALL existing Giddens community rows before upserting.
//   Use for a clean rebuild. Subsequent runs without ?strip=1 upsert normally.

import { NextRequest, NextResponse } from 'next/server';
import { fetchGiddensAustinCommunities } from '@/lib/scrapers/giddens-communities';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 1 REST API call + ~7 community page fetches + ~7 upserts + prune.
export const maxDuration = 150;

const SCRAPER_SUBMITTER_NAME = 'Giddens Homes Communities Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-giddens-communities@harmonyone.system';
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

async function stripExistingCommunities(): Promise<number> {
  const result = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${BUILDER_NAME}
      AND home_type = 'community'
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
      stripped = await stripExistingCommunities();
      console.log(
        `[scrape-giddens-communities] stripped ${stripped} existing community rows`,
      );
    } catch (err) {
      console.error(
        '[scrape-giddens-communities] strip failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const { rows, rawCount, skipped } = await fetchGiddensAustinCommunities();

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
        thumbnailUrl: row.thumbnailUrl,
        sourceUrl: row.sourceUrl,
        galleryUrls: row.galleryUrls,
        communityName: row.communityName,
        homeType: row.homeType,
        communityData: row.communityData,
      });
      if (result.created) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-giddens-communities] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate communities no longer in the source feed.
  // GUARDED — never run on an empty scrape so a transient empty response
  // can't wipe the whole set.
  let deactivated = 0;
  if (rows.length > 0 && !strip) {
    deactivated = await deactivateStaleBuilderInventory({
      builderName: BUILDER_NAME,
      homeType: 'community',
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

export async function GET(req: NextRequest) {
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
    console.error('[scrape-giddens-communities] fatal error:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
