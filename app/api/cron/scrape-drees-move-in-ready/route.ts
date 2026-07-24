// app/api/cron/scrape-drees-move-in-ready/route.ts
//
// Vercel Cron endpoint. Daily Drees Homes Austin Quick Move-In Ready (QMI)
// inventory scrape. One row per buyable QMI home with homeType='showcase'.
//
// Sister cron: /api/cron/scrape-drees emits per-neighborhood community rows
// for the same builder.

import { NextRequest, NextResponse } from 'next/server';
import { fetchDreesAustinQmi } from '@/lib/scrapers/drees-move-in-ready';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 1 HTTP call ~1s + ~51 upserts at ~50ms each = ~4s. 60s for headroom.
export const maxDuration = 60;

const SCRAPER_SUBMITTER_NAME = 'Drees Homes Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-drees-move-in-ready@harmonyone.system';

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
  const { rows, rawCount, skipped } = await fetchDreesAustinQmi();

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
        sourceUrl: row.flyerPdfUrl,
        thumbnailUrl: row.thumbnailUrl,
        galleryUrls: row.galleryUrls,
        extraDetails: row.extraDetails,
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
        `[scrape-drees-move-in-ready] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
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
    console.error('[scrape-drees-move-in-ready] fatal error:', msg);
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
