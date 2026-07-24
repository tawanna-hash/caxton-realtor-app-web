// app/api/cron/scrape-brookfield-residential-communities/route.ts
//
// Vercel Cron endpoint. Scrape Brookfield Residential communities for the
// Austin area (publication 'realtyline'). One row per community,
// home_type='community', kind='listing'.
//
// Source: Brookfield Sitecore Discover API (type=Community + type=Plan).
// Verify via the cron summary JSON + a signed-in spot-check of
// /communities/<id> — the public /api/inventory endpoint filters OUT
// home_type='community' rows.

import { NextRequest, NextResponse } from 'next/server';
import { fetchBrookfieldResidentialCommunities } from '@/lib/scrapers/brookfield-residential-communities';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 2 Discover fetches (communities + plans) — fast, but allow headroom.
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

  const { rows, rawCount, planCount, skipped } =
    await fetchBrookfieldResidentialCommunities();

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
        sourceUrl: row.sourceUrl,
        galleryUrls: row.galleryUrls,
        thumbnailUrl: row.thumbnailUrl,
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
        `[scrape-brookfield-residential-communities] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: deactivate community rows no longer in Brookfield's source (sold /
  // off-market). Guarded — never runs on an empty scrape so a transient empty
  // response can't wipe the set.
  let deactivated = 0;
  if (rows.length > 0) {
    try {
      deactivated = await deactivateStaleBuilderInventory({
        builderName: BUILDER_NAME,
        homeType: 'community',
        activeExternalIds: rows.map((r) => r.externalId),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        '[scrape-brookfield-residential-communities] deactivate stale inventory failed:',
        msg,
      );
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      refresh,
      rawCount,
      planCount,
      normalized: rows.length,
      skipped,
      inserted,
      updated,
      deactivated,
      errors,
      elapsedMs,
      communities: rows.map((r) => ({
        externalId: r.externalId,
        name: r.communityName,
        city: r.city,
        planCount: r.communityData.homePlans?.length ?? 0,
        amenities: r.communityData.amenities?.length ?? 0,
        schools: r.communityData.schools?.list.length ?? 0,
        priceFrom: r.communityData.priceFrom,
        sqftRange: r.communityData.sqftRange,
      })),
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
    console.error('[scrape-brookfield-residential-communities] fatal:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
