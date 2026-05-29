// app/api/cron/scrape-la-cima-promotions/route.ts
//
// Daily cron entrypoint for the La Cima builder-promotions scraper.
// Source: https://lacimatx.com/builder-promotions/
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// Output rows land as kind='promotion'. Following the same auto-activate
// policy established for Santa Rita Ranch promos: newly-imported La Cima
// promos are flipped to status='active' here. The developer page already
// curates participating builders, so per-builder review adds friction
// without catching anything our source page hasn't already filtered.
// Existing rows keep whatever status they already have — admin decisions
// are never overwritten.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchLaCimaPromotions } from '../../../../lib/scrapers/la-cima-promotions';
import { upsertBuilderInventoryByExternalId } from '../../../../lib/builder-inventory';

const sql = neon(process.env.DATABASE_URL!);

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
    scrape = await fetchLaCimaPromotions();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `scrape failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let created = 0;
  let updated = 0;
  let autoActivated = 0;
  const upsertErrors: { externalId: string; reason: string }[] = [];

  for (const row of scrape.rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId(row);
      if (result.created) {
        created++;
        // La Cima promo flyers are pulled from a curated developer page
        // that already vets participating builders. Auto-activate newly-
        // imported promos. Existing rows are NOT touched: once a human
        // (or this same policy) sets a status, the scraper has no
        // business overwriting it.
        await sql`
          UPDATE builder_inventory
          SET status = 'active',
              reviewed_at = NOW(),
              reviewed_by = 'system:scraper-trusted-lacima-promotions'
          WHERE id = ${result.row.id}
            AND status = 'pending'
        `;
        autoActivated++;
      } else {
        updated++;
      }
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    rawCount: scrape.rawCount,
    upserted: scrape.rows.length,
    created,
    updated,
    autoActivated,
    skipped: scrape.skipped,
    upsertErrors,
  });
}

export async function GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }
