// app/api/cron/scrape-mi-homes/route.ts
//
// Vercel Cron endpoint. Daily M/I Homes Austin scrape.
//
// Two passes:
//   1. Inventory (move-in-ready homes) — one row per home (home_type='showcase').
//   2. Communities — one row per community (home_type='community') with rich
//      community_data (plans w/ elevation images, amenities, sales office,
//      gallery, schools). Source: Sitecore community-card API (widened bbox)
//      + per-community detail-page ld+json enrichment (best-effort).

import { NextRequest, NextResponse } from 'next/server';
import { fetchMIHomesAustin } from '@/lib/scrapers/mi-homes';
import { fetchMIHomesCommunityRows } from '@/lib/scrapers/mi-homes-communities';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Inventory (~93 upserts) + 11 community detail fetches + 11 upserts.
export const maxDuration = 120;

const SCRAPER_SUBMITTER_NAME = 'M/I Homes Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-mi-homes@harmonyone.system';

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

  // ── Pass 1: inventory homes ──────────────────────────────────────────
  const { rows, rawCount, skipped } = await fetchMIHomesAustin();

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
        // S13 per-home additions:
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
        `[scrape-mi-homes] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // ── Pass 2: communities ──────────────────────────────────────────────
  let communityCount = 0;
  let communityInserted = 0;
  let communityUpdated = 0;
  let communityErrors = 0;
  let communityDetailFetched = 0;
  const communityDetailErrors: { community: string; error: string }[] = [];
  const communityErrorDetails: { title: string; error: string }[] = [];

  try {
    const communityResult = await fetchMIHomesCommunityRows();
    communityCount = communityResult.rows.length;
    communityDetailFetched = communityResult.detailFetched;
    communityDetailErrors.push(...communityResult.detailErrors);

    for (const row of communityResult.rows) {
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
          thumbnailUrl: row.thumbnailUrl,
          flyerPdfUrl: row.flyerPdfUrl,
          communityName: row.communityName,
          homeType: row.homeType,
          communityData: row.communityData,
        });
        if (result.created) communityInserted++;
        else communityUpdated++;
      } catch (err) {
        communityErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        communityErrorDetails.push({ title: row.title, error: msg });
        console.error(
          `[scrape-mi-homes] community upsert failed for "${row.title}" (${row.externalId}):`,
          msg,
        );
      }
    }
  } catch (err) {
    communityErrors++;
    const msg = err instanceof Error ? err.message : String(err);
    communityErrorDetails.push({ title: 'community-scrape', error: msg });
    console.error('[scrape-mi-homes] community scrape failed:', msg);
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      refresh,
      // inventory
      rawCount,
      normalized: rows.length,
      skipped,
      inserted,
      updated,
      errors,
      // communities
      communityCount,
      communityInserted,
      communityUpdated,
      communityErrors,
      communityDetailFetched,
      communityDetailErrors,
      elapsedMs,
    },
    errorDetails: errors > 0 ? errorDetails : undefined,
    communityErrorDetails: communityErrors > 0 ? communityErrorDetails : undefined,
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

  const refresh = req.nextUrl.searchParams.get('refresh') === '1';

  try {
    const result = await runScrape(refresh);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[scrape-mi-homes] fatal error:', msg);
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
