// app/api/cron/scrape-drees-promotions/route.ts
//
// Cron entrypoint for the Drees Homes promotions scraper.
// Vercel cron schedule: see vercel.json crons[] (staggered off existing slots).
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// Output rows land as kind='promotion'. Drees' offer copy (rates, buydown
// terms, end dates) is scraped verbatim from dreeshomes.com's own marketing,
// so each promo is auto-published to status='active' (a human 'rejected' stamp
// is respected — not re-activated by re-scrape). Pruned: promotions no longer
// in the sitemap are deleted via deleteStaleBuilderPromotions.

import { NextResponse } from 'next/server';
import { fetchDreesPromotions } from '../../../../lib/scrapers/drees-promotions';
import {
  upsertBuilderInventoryByExternalId,
  updateBuilderInventory,
} from '../../../../lib/builder-inventory';
import { deleteStaleBuilderPromotions } from '../../../../lib/builder-inventory-sync';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
    scrape = await fetchDreesPromotions();
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
  const details: Array<{
    externalId: string;
    title: string;
    publication: string;
    statusBefore: string;
    published: boolean;
    expiresAt: string | null;
    promoType: string | null;
  }> = [];

  for (const row of scrape.rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId(row);
      if (result.created) created++;
      else updated++;
      let publishedThis = false;
      // Drees promo copy is scraped verbatim from dreeshomes.com — publish live
      // so it surfaces in the active feed / builder promo counts. A human
      // 'rejected' stamp is respected (not re-activated by re-scrape).
      if (result.row.status !== 'active' && result.row.status !== 'rejected') {
        try {
          await updateBuilderInventory(result.row.id, { status: 'active' });
          published++;
          publishedThis = true;
        } catch (err) {
          console.error(
            `[scrape-drees-promotions] publish failed for "${row.title}" (${row.externalId}):`,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
      details.push({
        externalId: row.externalId,
        title: row.title,
        publication: row.publication,
        statusBefore: result.row.status,
        published: publishedThis,
        expiresAt: row.expiresAt ?? null,
        promoType: row.promoType ?? null,
      });
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Prune: delete Drees promotions no longer in the sitemap (offers that have
  // rotated off dreeshomes.com). Guarded — never runs on an empty scrape;
  // human-submitted promotions (NULL external_id) are never deleted.
  let deleted = 0;
  if (scrape.rows.length > 0) {
    try {
      deleted = await deleteStaleBuilderPromotions({
        builderName: 'Drees Homes',
        activeExternalIds: scrape.rows.map((r) => r.externalId),
      });
    } catch (err) {
      console.error(
        '[scrape-drees-promotions] delete stale promotions failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // DIAGNOSTIC: snapshot every Drees promo row so we can see status +
  // publication + expiresAt (debugging the /builders promo surface).
  let allPromos: Array<{
    id: number;
    title: string;
    external_id: string | null;
    status: string;
    publication: string;
    promo_type: string | null;
    expires_at: string | null;
    home_type: string | null;
  }> = [];
  try {
    const sqlDiag = neon(process.env.DATABASE_URL!);
    allPromos = (await sqlDiag`
      SELECT id, title, external_id, status, publication, promo_type, expires_at, home_type
      FROM builder_inventory
      WHERE builder_name = ${'Drees Homes'} AND kind = 'promotion'
      ORDER BY id
    `) as typeof allPromos;
  } catch (err) {
    console.error(
      '[scrape-drees-promotions] diagnostic query failed:',
      err instanceof Error ? err.message : String(err),
    );
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
    details,
    allPromos,
  });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
