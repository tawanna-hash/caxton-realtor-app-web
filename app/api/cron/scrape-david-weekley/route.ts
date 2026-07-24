// app/api/cron/scrape-david-weekley/route.ts
//
// Vercel Cron endpoint. Runs daily, fetches David Weekley Homes Austin
// Quick Move-in inventory (showcases) from /Search/ShowcaseData and
// upserts one row per home into builder_inventory, keyed on
// (builder_name, external_id).
//
// Also:
//  - Backfills structured community_data (home plans, amenities, schools,
//    tax, sales office, gallery, lifecycle status) + descriptions for
//    pre-S13 David Weekley community rows, using each community's
//    davidweekleyhomes.com page URL stored in flyer_pdf_url. Idempotent —
//    only rows with community_data IS NULL OR description IS NULL are touched.
//  - Ingests MISSING communities linked from the coming-soon / close-out
//    category pages (coming-soon is server-rendered; close-out is JS-rendered
//    and best-effort). New rows are created as active community summaries.

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchDavidWeekleyAustin,
  fetchDavidWeekleyCommunityData,
  fetchDavidWeekleyCommunityList,
} from '@/lib/scrapers/david-weekley';
import type { CommunityData } from '@/lib/scrapers/david-weekley';
import {
  listBuilderInventoryCommunityBackfill,
  builderInventoryExistsByUrl,
  createBuilderInventory,
  updateBuilderInventory,
  upsertBuilderInventoryByExternalId,
} from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Two parallel HTTP calls (CommunityData + ShowcaseData) ~1s each, ~77 upserts
// at ~50ms each, plus up to ~30 community-page fetches for the
// community_data backfill + ingestion at ~1s each (concurrency 5). 120s gives
// headroom for Neon cold starts and retries.
export const maxDuration = 120;

const SCRAPER_SUBMITTER_NAME = 'David Weekley Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-david-weekley@harmonyone.system';
const BUILDER_NAME = 'David Weekley Homes';

const COMING_SOON_LIST =
  'https://www.davidweekleyhomes.com/new-homes/tx/austin/coming-soon';
const CLOSE_OUT_LIST =
  'https://www.davidweekleyhomes.com/new-homes/tx/austin/close-out';

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

// Parse a plan range string like "3", "3-4", or "1713 - 1716" into [min, max].
function planRangeNum(v: string | null | undefined): [number, number] | null {
  if (!v) return null;
  const parts = v.split('-').map((s) => Number(s.trim()));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  return [Math.min(...parts), Math.max(...parts)];
}

// Best-effort numeric ranges from the structured community data, so the
// row-level price/sqft/beds/baths columns stay consistent with
// human-submitted communities (powers list cards + the stats grid).
function computeCommunityRanges(cd: CommunityData) {
  const plans = cd.homePlans ?? [];
  let bedsMin: number | null = null;
  let bedsMax: number | null = null;
  let bathsMin: number | null = null;
  let bathsMax: number | null = null;
  let sqftMin: number | null = null;
  let sqftMax: number | null = null;
  let priceMin: number | null = null;
  const bumpMin = (cur: number | null, v: number) =>
    cur == null ? v : Math.min(cur, v);
  const bumpMax = (cur: number | null, v: number) =>
    cur == null ? v : Math.max(cur, v);
  for (const p of plans) {
    const b = planRangeNum(p.beds);
    if (b) {
      bedsMin = bumpMin(bedsMin, b[0]);
      bedsMax = bumpMax(bedsMax, b[1]);
    }
    const ba = planRangeNum(p.baths);
    if (ba) {
      bathsMin = bumpMin(bathsMin, ba[0]);
      bathsMax = bumpMax(bathsMax, ba[1]);
    }
    const sq = planRangeNum(p.sqftDisplay);
    if (sq) {
      sqftMin = bumpMin(sqftMin, sq[0]);
      sqftMax = bumpMax(sqftMax, sq[1]);
    }
    if (p.basePrice != null) priceMin = bumpMin(priceMin, p.basePrice);
  }
  return {
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMin,
    sqftMax,
    priceMin,
    priceMax: null as number | null,
  };
}

async function runScrape(opts: { refresh: boolean }) {
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
        `[scrape-david-weekley] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Backfill structured community_data + descriptions for David Weekley
  // community rows (pre-S13 orphans). Each community's davidweekleyhomes.com
  // page URL lives in flyer_pdf_url; fetch it and extract the full structured
  // blob (plans, amenities, schools, tax, sales office, status). Idempotent —
  // only rows with community_data IS NULL OR description IS NULL are touched.
  let communityDataBackfilled = 0;
  let communityDataErrors = 0;
  try {
    const pending = await listBuilderInventoryCommunityBackfill(BUILDER_NAME, {
      refresh: opts.refresh,
    });
    const CONCURRENCY = 5;
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (row) => {
          if (!row.flyerPdfUrl) return;
          const data = await fetchDavidWeekleyCommunityData(row.flyerPdfUrl);
          if (!data) return;
          const { description, communityData: cd } = data;
          // Kissing Tree is David Weekley's active-adult (55+) community.
          if (/kissing tree/i.test(row.title)) cd.adultOnly = true;
          try {
            await updateBuilderInventory(row.id, { description, communityData: cd });
            communityDataBackfilled++;
          } catch (err) {
            communityDataErrors++;
            console.error(
              `[scrape-david-weekley] community_data backfill failed for "${row.title}" (${row.id}):`,
              err instanceof Error ? err.message : String(err),
            );
          }
        }),
      );
    }
  } catch (err) {
    console.error(
      '[scrape-david-weekley] community_data backfill error:',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Ingest MISSING communities linked from the coming-soon / close-out
  // category pages. Coming-soon is server-rendered (reliable); close-out +
  // market pages are JS-rendered (best-effort, often empty). Communities
  // already tracked (by external_id or flyer_pdf_url) are skipped.
  let communitiesIngested = 0;
  let ingestionErrors = 0;
  const communityListUrls: string[] = [];
  const ingestionDetails: { url: string; action: string }[] = [];
  const listFetchResults: {
    listUrl: string;
    status: number | null;
    htmlLength: number;
    linksFound: number;
    sampleHrefs: string[];
    error: string | null;
    urls: string[];
  }[] = [];
  const listUrls = [COMING_SOON_LIST, CLOSE_OUT_LIST];
  for (const listUrl of listUrls) {
    const r = await fetchDavidWeekleyCommunityList(listUrl);
    listFetchResults.push({ listUrl, ...r });
    communityListUrls.push(...r.urls);
    for (const url of r.urls) {
      try {
        const exists = await builderInventoryExistsByUrl(BUILDER_NAME, url);
        if (exists) {
          ingestionDetails.push({ url, action: 'exists' });
          continue;
        }
        const data = await fetchDavidWeekleyCommunityData(url);
        if (!data) {
          ingestionDetails.push({ url, action: 'no-data' });
          continue;
        }
        const { description, communityData: cd } = data;
        const name = cd.communityName || url.split('/').filter(Boolean).pop() || 'Community';
        if (/kissing tree/i.test(name)) cd.adultOnly = true;
        const created = await createBuilderInventory({
          kind: 'listing',
          publication: 'realtyline',
          submittedByName: SCRAPER_SUBMITTER_NAME,
          submittedByEmail: SCRAPER_SUBMITTER_EMAIL,
          builderName: BUILDER_NAME,
          title: name,
          city: cd.city ?? 'Austin',
          state: 'TX',
          description,
          flyerPdfUrl: url,
          externalId: url,
          homeType: 'community',
          communityName: name,
          communityData: cd,
          thumbnailUrl: cd.imageUrls?.[0] ?? null,
          ...computeCommunityRanges(cd),
        });
        // Scraper-produced listing rows auto-publish to active (mirrors
        // upsertBuilderInventoryByExternalId).
        await updateBuilderInventory(created.id, { status: 'active' });
        communitiesIngested++;
        ingestionDetails.push({ url, action: 'created' });
      } catch (err) {
        ingestionErrors++;
        ingestionDetails.push({ url, action: 'error' });
        console.error(
          `[scrape-david-weekley] ingestion failed for ${url}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      refresh: opts.refresh,
      rawCount,
      normalized: rows.length,
      skipped,
      inserted,
      updated,
      errors,
      communityDataBackfilled,
      communityDataErrors,
      communitiesIngested,
      ingestionErrors,
      communityListUrls,
      listFetchResults,
      ingestionDetails,
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
    const refresh = new URL(req.url).searchParams.get('refresh') === '1';
    const result = await runScrape({ refresh });
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
