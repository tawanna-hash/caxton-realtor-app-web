// app/api/cron/scrape-newmark-communities/route.ts
//
// Vercel Cron endpoint. Fetches Newmark Homes Austin communities from
// newmarkhomes.com/new-homes/austin/communities and upserts one row per
// community into builder_inventory (kind='listing', homeType='community',
// publication='realtyline'), keyed on (builder_name, external_id).
//
// After upserting, prunes communities no longer on the page via
// deactivateStaleBuilderInventory (status -> 'expired', guarded against an
// empty scrape).

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNewmarkCommunities,
  NEWMARK_BUILDER_NAME,
  NEWMARK_PUBLICATION,
} from '@/lib/scrapers/newmark-homes';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// One page fetch (~1s) + up to ~10 community upserts at ~50ms each.
export const maxDuration = 60;

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
    const { rows } = await fetchNewmarkCommunities();
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
          bedsMin: null,
          bedsMax: null,
          bathsMin: null,
          bathsMax: null,
          sqftMin: null,
          sqftMax: null,
          priceMin: null,
          priceMax: null,
          flyerPdfUrl: null,
          thumbnailUrl: row.thumbnailUrl,
          sourceUrl: row.sourceUrl,
          address: row.address,
          homeType: 'community',
        });
        if (result.created) inserted++;
        else updated++;
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        errorDetails.push({ title: row.title, error: msg });
        console.error(
          `[scrape-newmark-communities] upsert failed for "${row.title}" (${row.externalId}):`,
          msg,
        );
      }
    }

    // Prune communities no longer on the page (sold out / removed). Guarded —
    // never runs on an empty scrape so a transient empty page can't wipe them.
    let deactivated = 0;
    if (rows.length > 0) {
      try {
        deactivated = await deactivateStaleBuilderInventory({
          builderName: NEWMARK_BUILDER_NAME,
          homeType: 'community',
          activeExternalIds: rows.map((r) => r.externalId),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[scrape-newmark-communities] deactivate stale failed:', msg);
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
