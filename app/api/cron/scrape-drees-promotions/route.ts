// app/api/cron/scrape-drees-promotions/route.ts
//
// Cron entrypoint for the Drees Homes promotions scraper (100% rebuild).
// Conforms to docs/promotion-scraper-template.md §10.
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
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
//
// ?strip=1 — deletes ALL existing Drees promotion rows before upserting.
//   Use for a clean rebuild.

import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';
import {
  getDreesPromotions,
  DREES_PROMOTION_CLAIMS,
} from '@/lib/scrapers/drees-promotions';
import {
  upsertBuilderInventoryByExternalId,
  updateBuilderInventory,
  claimExistingPromotion,
} from '@/lib/builder-inventory';
import { deleteStaleBuilderPromotions } from '@/lib/builder-inventory-sync';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILDER_NAME = 'Drees Homes';

function authorized(req: Request): boolean {
  if (process.env.VERCEL_ENV !== 'production') return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get('authorization');
  return got === `Bearer ${expected}`;
}

async function stripExistingPromotions(): Promise<number> {
  const result = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${BUILDER_NAME}
      AND kind = 'promotion'
      AND external_id IS NOT NULL
    RETURNING id
  `;
  return result.length;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: 'Bad or missing Authorization header' },
      { status: 401 },
    );
  }

  const strip = req.nextUrl.searchParams.get('strip') === '1';
  const startedAt = Date.now();

  let stripped = 0;
  if (strip) {
    try {
      stripped = await stripExistingPromotions();
      console.log(
        `[scrape-drees-promotions] stripped ${stripped} existing promotion rows`,
      );
    } catch (err) {
      console.error(
        '[scrape-drees-promotions] strip failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const { rows, rawCount } = getDreesPromotions();

  // Step 1: Claim existing manually-entered rows (those without external_id)
  // by setting their external_id. This prevents the upsert from creating
  // duplicates when a promotion was first entered through the admin form.
  let claimed = 0;
  for (const claim of DREES_PROMOTION_CLAIMS) {
    try {
      const count = await claimExistingPromotion({
        builderName: BUILDER_NAME,
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
      if (result.created) created++;
      else updated++;
      let publishedThis = false;
      // Drees promo copy is verbatim from their marketing flyers — publish
      // live so it surfaces in the active feed. A human 'rejected' stamp
      // is respected (not re-activated by re-scrape).
      // (promotion-scraper-template §10a)
      if (
        result.row.status !== 'active' &&
        result.row.status !== 'rejected'
      ) {
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
  // (promotion-scraper-template §10b)
  let deleted = 0;
  if (rows.length > 0) {
    try {
      deleted = await deleteStaleBuilderPromotions({
        builderName: BUILDER_NAME,
        activeExternalIds: rows.map((r) => r.externalId),
      });
    } catch (err) {
      console.error(
        '[scrape-drees-promotions] delete stale promotions failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    stripped,
    rawCount,
    claimed,
    created,
    updated,
    published,
    deleted,
    upsertErrors,
    details,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
