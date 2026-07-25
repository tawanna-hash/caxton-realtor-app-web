// app/api/cron/scrape-drees-promotions/route.ts
//
// Cron entrypoint for the Drees Homes promotions scraper.
// Vercel cron schedule: 30 14 * * *  (9:30 AM CT during DST)
// (staggered off the Drees move-in 0 20 and communities 15 20 slots)
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// Drees does NOT publish promotions on a public API or offers page — their
// promotions are distributed as flyer PDFs to realtor partners. This scraper
// uses a config array of known Drees promotions (lib/scrapers/drees-promotions.ts).
// When Drees releases a new promotion, add an entry to the config.
//
// Output rows land as kind='promotion'. Drees promo copy is verbatim from
// their own marketing flyers, so each promo is auto-published to
// status='active' (a human 'rejected' stamp is respected).
// Pruned: promotions no longer in the config are deleted (only affects
// scraper-created rows with external_id; human-submitted rows are safe).

import { NextResponse } from 'next/server';
import { getDreesPromotions, DREES_PROMOTION_CLAIMS } from '../../../../lib/scrapers/drees-promotions';
import {
  upsertBuilderInventoryByExternalId,
  updateBuilderInventory,
  claimExistingPromotion,
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
  const { rows, rawCount } = getDreesPromotions();

  // Step 1: Claim existing manually-entered rows (those without external_id)
  // by setting their external_id. This prevents the upsert from creating
  // duplicates when a promotion was first entered through the admin form.
  let claimed = 0;
  for (const claim of DREES_PROMOTION_CLAIMS) {
    try {
      const count = await claimExistingPromotion({
        builderName: 'Drees Homes',
        title: claim.title,
        externalId: claim.externalId,
      });
      claimed += count;
    } catch (err) {
      console.error(
        `[scrape-drees-promotions] claim failed for "${claim.title}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Step 2: Upsert each promotion.
  let created = 0;
  let updated = 0;
  let published = 0;
  const upsertErrors: { externalId: string; reason: string }[] = [];
  const details: Array<{
    externalId: string;
    title: string;
    statusBefore: string;
    published: boolean;
  }> = [];

  for (const row of rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId(row);
      if (result.created) created++; else updated++;
      let publishedThis = false;
      // Drees promo copy is verbatim from their marketing flyers — publish
      // live so it surfaces in the active feed. A human 'rejected' stamp
      // is respected (not re-activated by re-scrape).
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
        statusBefore: result.row.status,
        published: publishedThis,
      });
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Step 3: Prune — delete Drees promotions no longer in the config.
  // Guarded: never runs on an empty scrape; human-submitted promotions
  // (NULL external_id) are never deleted.
  let deleted = 0;
  if (rows.length > 0) {
    try {
      deleted = await deleteStaleBuilderPromotions({
        builderName: 'Drees Homes',
        activeExternalIds: rows.map((r) => r.externalId),
      });
    } catch (err) {
      console.error(
        '[scrape-drees-promotions] delete stale promotions failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // DIAGNOSTIC: snapshot every Drees promo row.
  let allPromos: Array<{
    id: number;
    title: string;
    external_id: string | null;
    status: string;
    publication: string;
    promo_type: string | null;
    starts_at: string | null;
    expires_at: string | null;
  }> = [];
  try {
    const sqlDiag = neon(process.env.DATABASE_URL!);
    allPromos = (await sqlDiag`
      SELECT id, title, external_id, status, publication, promo_type, starts_at, expires_at
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
    rawCount,
    claimed,
    created,
    updated,
    published,
    deleted,
    upsertErrors,
    details,
    allPromos,
  });
}

export async function GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }
