// app/api/cron/scrape-david-weekley-promotions/route.ts
//
// Vercel Cron endpoint. Fetches David Weekley Homes Austin promotions
// from /promotion/marketpromotionslist and upserts one row per offer
// into builder_inventory as kind='promotion'.
//
// Auto-publishes verbatim builder copy (with rejected guard).
// Prunes stale promotions via deleteStaleBuilderPromotions (DELETE, not
// deactivate).
//
// Template: docs/promotion-scraper-template.md §10

import { NextRequest, NextResponse } from 'next/server';
import { fetchDavidWeekleyAustinPromotions } from '@/lib/scrapers/david-weekley-promotions';
import {
  upsertBuilderInventoryByExternalId,
  updateBuilderInventory,
} from '@/lib/builder-inventory';
import { deleteStaleBuilderPromotions } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One API call + ~4 upserts. 60s is plenty.
export const maxDuration = 60;

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
  const { rows, rawCount, skipped } = await fetchDavidWeekleyAustinPromotions();

  let created = 0;
  let updated = 0;
  let published = 0;
  let errors = 0;
  const errorDetails: { title: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId({
        externalId: row.externalId,
        kind: 'promotion',
        publication: row.publication,
        submittedByName: row.submittedByName,
        submittedByEmail: row.submittedByEmail,
        builderName: row.builderName,
        title: row.title,
        city: row.city,
        state: row.state,
        description: row.description,
        bedsMin: null,
        bedsMax: null,
        bathsMin: null,
        bathsMax: null,
        sqftMin: null,
        sqftMax: null,
        priceMin: null,
        priceMax: null,
        promoType: row.promoType,
        startsAt: row.startsAt,
        expiresAt: row.expiresAt,
        flyerPdfUrl: row.flyerPdfUrl,
        thumbnailUrl: row.thumbnailUrl,
        sourceUrl: row.sourceUrl,
        galleryUrls: row.galleryUrls,
        communityName: row.communityName,
      });

      if (result.created) created++;
      else updated++;

      // Auto-publish verbatim builder copy (never re-activate rejected rows).
      if (
        result.row.status !== 'active' &&
        result.row.status !== 'rejected'
      ) {
        await updateBuilderInventory(result.row.id, { status: 'active' });
        published++;
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      errorDetails.push({ title: row.title, error: msg });
      console.error(
        `[scrape-david-weekley-promotions] upsert failed for "${row.title}" (${row.externalId}):`,
        msg,
      );
    }
  }

  // Prune: DELETE promotions no longer in the source feed.
  // Guarded — returns 0 on an empty scrape.
  let deleted = 0;
  if (rows.length > 0) {
    try {
      deleted = await deleteStaleBuilderPromotions({
        builderName: BUILDER_NAME,
        activeExternalIds: rows.map((r) => r.externalId),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[scrape-david-weekley-promotions] delete stale failed:', msg);
    }
  }

  const elapsedMs = Date.now() - startedAt;

  return {
    ok: true,
    summary: {
      rawCount,
      normalized: rows.length,
      skipped,
      created,
      updated,
      published,
      deleted,
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
    console.error('[scrape-david-weekley-promotions] fatal error:', msg);
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
