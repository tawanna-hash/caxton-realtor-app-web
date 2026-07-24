// app/api/cron/scrape-brookfield-residential/route.ts
//
// Vercel Cron endpoint. Scrape Brookfield Residential quick-move-in homes for
// the Austin area (publication 'realtyline').
//
// Source: Brookfield Sitecore Discover API (TX QMI lots, narrowed to the
// Austin-area bounding box) + per-home detail-page enrichment (gallery,
// Matterport 3D tour, floor-plan image). One row per home, home_type=
// 'showcase', kind='listing'.

import { NextRequest, NextResponse } from 'next/server';
import { fetchBrookfieldResidentialAustin } from '@/lib/scrapers/brookfield-residential';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// TX QMI fetch (2 Discover pages) + Austin-area detail-page enrichments.
export const maxDuration = 150;

const SCRAPER_SUBMITTER_NAME = 'Brookfield Residential Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-brookfield-residential@harmonyone.system';
const BUILDER_NAME = 'Brookfield Residential';

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

async function runScrape(refresh: boolean) {
  const startedAt = Date.now();

  const { rows, rawCount, skipped, detailFetched, detailErrors } =
    await fetchBrookfieldResidentialAustin();

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
        galleryUrls: row.galleryUrls,
        extraDetails: row.extraDetails,
        thumbnailUrl: row.thumbnailUrl,
        address: row.address,
        readyDate: row.readyDate,
        planName: row.planName,
        communityName: row.communityName,
        homeType: row.homeType,
      });
      if (result.created) inserted++;
      else updated++;
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-brookfield-residential] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate inventory homes no longer in Brookfield's source (sold /
  // off-market). Guarded — never runs on an empty scrape so a transient empty
  // response can't wipe the set.
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
      console.error('[scrape-brookfield-residential] deactivate stale inventory failed:', msg);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      refresh,
      rawCount,
      normalized: rows.length,
      skipped,
      inserted,
      updated,
      deactivated,
      errors,
      detailFetched,
      detailErrors,
      elapsedMs,
    },
    errorDetails: errors > 0 ? errorDetails : undefined,
  };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === '1';
  try {
    const result = await runScrape(refresh);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-brookfield-residential] fatal:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
