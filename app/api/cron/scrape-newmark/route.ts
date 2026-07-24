// app/api/cron/scrape-newmark/route.ts
//
// Vercel Cron endpoint. Fetches Newmark Homes Austin move-in-ready homes from
// newmarkhomes.com/new-homes/austin and upserts one row per home into
// builder_inventory (kind='listing', homeType='showcase', publication=
// 'realtyline'), keyed on (builder_name, external_id).
//
// Each home's per-home incentive ribbon (e.g. "4.99% Fixed Rate") is captured
// into the row description — NOT as a separate kind='promotion' row, since
// these are per-home financing flags rather than market-wide offers.
//
// After upserting, prunes homes no longer on the page (sold) via
// deactivateStaleBuilderInventory (status -> 'expired', guarded).

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNewmarkMoveInReady,
  NEWMARK_BUILDER_NAME,
  NEWMARK_PUBLICATION,
} from '@/lib/scrapers/newmark-homes';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One page fetch (~1s) + up to ~30 home upserts at ~50ms each.
export const maxDuration = 90;

const SCRAPER_SUBMITTER_NAME = 'Newmark Auto-Importer';
const SCRAPER_SUBMITTER_EMAIL = 'scraper-newmark@harmonyone.system';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  if (process.env.VERCEL_ENV !== 'production') return { ok: true };
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!expected) return { ok: false, reason: 'CRON_SECRET not configured' };
  if (got !== `Bearer ${expected}`) {
    return { ok: false, reason: 'Bad or missing Authorization header' };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, reason: auth.reason }, { status: 401 });
  }

  const startedAt = Date.now();
  let rawCount = 0;
  try {
    const { rows } = await fetchNewmarkMoveInReady();
    rawCount = rows.length;

    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const errorDetails: { title: string; error: string }[] = [];

    for (const row of rows) {
      try {
        const result = await upsertBuilderInventoryByExternalId({
          externalId: row.externalId,
          kind: 'listing',
          publication: NEWMARK_PUBLICATION,
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
          sourceUrl: row.sourceUrl,
          address: row.address,
          communityName: row.communityName,
          planName: row.planName,
          homeType: 'showcase',
        });
        if (result.created) inserted++;
        else updated++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorDetails.push({ title: row.title, error: msg });
        console.error(
          `[scrape-newmark] upsert failed for "${row.title}" (${row.externalId}):`,
          msg,
        );
      }
    }

    // Prune sold / off-market homes. Guarded — never on an empty scrape.
    let deactivated = 0;
    if (rows.length > 0) {
      try {
        deactivated = await deactivateStaleBuilderInventory({
          builderName: NEWMARK_BUILDER_NAME,
          homeType: 'showcase',
          activeExternalIds: rows.map((r) => r.externalId),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[scrape-newmark] deactivate stale failed:', msg);
      }
    }

    return NextResponse.json({
      ok: true,
      ms: Date.now() - startedAt,
      rawCount,
      inserted,
      updated,
      errors,
      deactivated,
      errorDetails: errorDetails.slice(0, 10),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg, rawCount },
      { status: 500 },
    );
  }
}
