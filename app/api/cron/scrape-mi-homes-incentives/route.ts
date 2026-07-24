// app/api/cron/scrape-mi-homes-incentives/route.ts
//
// Daily cron entrypoint for the M/I Homes incentives scraper.
// Vercel cron schedule: 0 14 * * *  (9 AM CT during DST, 8 AM CT during standard)
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// Output rows land as kind='promotion'. M/I's promo copy (rates, terms, dates)
// is scraped verbatim from mihomes.com's own marketing, so each promo is
// auto-published to status='active' (a human 'rejected' stamp is respected).
// Pruned: promotions no longer on mihomes.com are deleted.

import { NextResponse } from 'next/server';
import { fetchMIHomesIncentives } from '../../../../lib/scrapers/mi-homes-incentives';
import {
  upsertBuilderInventoryByExternalId,
  updateBuilderInventory,
} from '../../../../lib/builder-inventory';
import { deleteStaleBuilderPromotions } from '../../../../lib/builder-inventory-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function authorized(req: Request): boolean {
  if (process.env.VERCEL_ENV !== 'production') return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Bad or missing Authorization header' },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  let scrape;
  try {
    scrape = await fetchMIHomesIncentives();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `scrape failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let created = 0;
  let updated = 0;
  let published = 0;
  const upsertErrors: { externalId: string; reason: string }[] = [];

  for (const row of scrape.rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId(row);
      if (result.created) created++; else updated++;
      // M/I promo copy is scraped verbatim from mihomes.com — publish live so
      // it surfaces in the active feed / builder promo counts. A human
      // 'rejected' stamp is respected (not re-activated by re-scrape).
      if (result.row.status !== 'active' && result.row.status !== 'rejected') {
        try {
          await updateBuilderInventory(result.row.id, { status: 'active' });
          published++;
        } catch (err) {
          console.error(
            `[scrape-mi-homes-incentives] publish failed for "${row.title}" (${row.externalId}):`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Prune: delete M/I Homes promotions no longer in the source (offers that
  // have rotated off mihomes.com). Keeps only the promotions present in this
  // scrape. Guarded — never runs on an empty scrape; human-submitted
  // promotions (NULL external_id) are never deleted.
  let deleted = 0;
  if (scrape.rows.length > 0) {
    try {
      deleted = await deleteStaleBuilderPromotions({
        builderName: 'M/I Homes',
        activeExternalIds: scrape.rows.map((r) => r.externalId),
      });
    } catch (err) {
      console.error(
        '[scrape-mi-homes-incentives] delete stale promotions failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

    return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    rawCount: scrape.rawCount,
    upserted: scrape.rows.length,
    created,
    updated,
    published,
    deleted,
    skipped: scrape.skipped,
    upsertErrors,
  });
}

export async function GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }
