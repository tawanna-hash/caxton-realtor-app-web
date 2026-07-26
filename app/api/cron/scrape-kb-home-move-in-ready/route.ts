// app/api/cron/scrape-kb-home-move-in-ready/route.ts
//
// Vercel Cron endpoint. Fetches KB Home Austin move-in-ready (MIR) homes
// from each community page's embedded LocalQMIs JSON array. Upserts one
// row per home into builder_inventory, keyed on (builder_name, external_id).
//
// Template: docs/scraper-template.md

import { NextRequest, NextResponse } from 'next/server';
import { fetchKBHomeAustinMIR } from '@/lib/scrapers/kb-home-move-in-ready';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Sitemap + 14 community fetches + up to ~128 MIR detail page fetches.
// ~7s for communities + ~64s for detail pages = ~71s on happy path.
// 300s gives headroom for Neon cold starts, retries, and slow responses.
export const maxDuration = 300;

const SCRAPER_SUBMITTER_NAME = 'KB Home Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-kb-home@harmonyone.system';
const BUILDER_NAME = 'KB Home';

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
  const { rows, rawCount, skipped } = await fetchKBHomeAustinMIR();

  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails: { title: string; error: string }[] = [];

  for (const row of rows) {
    try {
      // Move 'Virtual Tour' from the scraper's extraDetails into the
      // underscore-prefixed _virtualTourUrl key the frontend reads, and
      // strip the old key so it doesn't duplicate in Property details.
      const {
        'Virtual Tour': vtUrl,
        ...restDetails
      } = row.extraDetails ?? {};
      const enrichedDetails: Record<string, string> = {
        ...restDetails,
        ...(row.floorPlanUrl ? { _floorplanUrl: row.floorPlanUrl } : {}),
        ...(vtUrl ? { _virtualTourUrl: vtUrl } : {}),
      } as Record<string, string>;
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
        extraDetails: Object.keys(enrichedDetails).length > 0 ? enrichedDetails : null,
      });
      if (result.created) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-kb-home-mir] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate MIR homes no longer in KB Home's source (sold / off-market).
  // Guarded — never runs on an empty scrape.
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
      console.error('[scrape-kb-home-mir] deactivate stale inventory failed:', msg);
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

export async function GET(req: NextRequest) {
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
    console.error('[scrape-kb-home-mir] fatal error:', msg);
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
