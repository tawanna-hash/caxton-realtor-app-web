// app/api/cron/scrape-la-cima-promotions/route.ts
//
// Daily cron entrypoint for the La Cima builder-promotions scraper.
// Source: https://lacimatx.com/builder-promotions/
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
//
// Output rows land as kind='promotion'. Newly-imported La Cima promos
// are auto-activated (the developer page already curates participating
// builders). Existing rows keep their human-set status.
//
// Prune: deletes stale promotion rows per builder (same pattern as SRR).

import { NextResponse, type NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchLaCimaPromotions } from '@/lib/scrapers/la-cima-promotions';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deleteStaleBuilderPromotions } from '@/lib/builder-inventory-sync';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!isProduction) return { ok: true };
  if (!expected) return { ok: false, reason: 'CRON_SECRET not configured' };
  if (got !== `Bearer ${expected}`) return { ok: false, reason: 'Bad or missing Authorization header' };
  return { ok: true };
}

async function handle(req: NextRequest) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason },
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
      const result = await upsertBuilderInventoryByExternalId({ ...row, developerName: 'La Cima' });
      if (result.created) {
        created++;
        // Auto-activate newly-imported promos. Existing rows keep their status.
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

  // Prune stale promotions per builder (same pattern as SRR).
  let pruned = 0;
  if (scrape.rows.length > 0) {
    const byBuilder = new Map<string, string[]>();
    for (const r of scrape.rows) {
      const bn = r.builderName ?? 'La Cima';
      if (!byBuilder.has(bn)) byBuilder.set(bn, []);
      byBuilder.get(bn)!.push(r.externalId);
    }
    for (const [bn, ids] of byBuilder) {
      pruned += await deleteStaleBuilderPromotions({
        builderName: bn,
        activeExternalIds: ids,
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
    pruned,
    skipped: scrape.skipped,
    upsertErrors,
  });
}

export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
