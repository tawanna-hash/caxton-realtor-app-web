// app/api/cron/scrape-david-weekley/route.ts
//
// Vercel Cron endpoint. Runs daily, fetches David Weekley Homes Austin
// Quick Move-in inventory (showcases) from /Search/ShowcaseData and
// upserts one row per home into builder_inventory, keyed on
// (builder_name, external_id).

import { NextRequest, NextResponse } from 'next/server';
import { fetchDavidWeekleyAustin } from '@/lib/scrapers/david-weekley';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Two parallel HTTP calls (CommunityData lookup + ShowcaseData) ~1s each,
// ~77 upserts at ~50ms each. 150s gives headroom for Neon cold starts.
export const maxDuration = 150;

const SCRAPER_SUBMITTER_NAME = 'David Weekley Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-david-weekley@harmonyone.system';
const BUILDER_NAME = 'David Weekley Homes';

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

async function runScrape() {
  const startedAt = Date.now();
  const { rows, rawCount, skipped } = await fetchDavidWeekleyAustin();

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
        `[scrape-david-weekley] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate inventory homes no longer in David Weekley's source
  // (sold / off-market). Guarded — never runs on an empty scrape.
  let deactivated = 0;
  if (rows.length > 0) {
    try {
      deactivated = await deactivateStaleBuilderInventory({
        builderName: BUILDER_NAME,
        homeType: 'showcase',
        activeExternalIds: rows.map((r) => r.externalId),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[scrape-david-weekley] deactivate stale inventory failed:', msg);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      rawCount,
      normalized: rows.length,
      skipped,
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

  try {
    const result = await runScrape();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-david-weekley] fatal error:', msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    );
  }
}

// Vercel cron may invoke as POST. Accept both.
export async function POST(req: NextRequest) {
  return GET(req);
}

export const GET = withScraperRun('scrape-david-weekley', _GET);
