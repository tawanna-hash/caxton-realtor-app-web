// app/api/cron/scrape-santa-rita-ranch-promotions/route.ts
//
// Daily cron entrypoint for the Santa Rita Ranch builder-incentives scraper.
// Source: https://santaritaranchaustin.com/builder-incentives-in-liberty-hill/
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
//
// ?strip=1 — deletes ALL existing SRR promotion rows before upserting.
//
// Output rows land as kind='promotion'. Newly-imported SRR promos are
// auto-activated: the developer page already curates participating
// builders and per-builder review adds no signal. Existing rows keep
// whatever status they already have — admin decisions are never
// overwritten.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { fetchSantaRitaRanchPromotions } from '@/lib/scrapers/santa-rita-ranch-promotions';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUILDER_NAME = 'Santa Rita Ranch';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!isProduction) return { ok: true };
  if (!expected) return { ok: false, reason: 'CRON_SECRET not configured' };
  if (got !== `Bearer ${expected}`) return { ok: false, reason: 'Bad or missing Authorization header' };
  return { ok: true };
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
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? 'Bad or missing Authorization header' },
      { status: 401 },
    );
  }

  const strip = new URL(req.url).searchParams.get('strip') === '1';

  const startedAt = Date.now();

  let stripped = 0;
  if (strip) {
    try {
      stripped = await stripExistingPromotions();
      console.log(`[scrape-srr-promotions] stripped ${stripped} existing promotion rows`);
    } catch (err) {
      console.error('[scrape-srr-promotions] strip failed:', err instanceof Error ? err.message : String(err));
    }
  }

  let scrape;
  try {
    scrape = await fetchSantaRitaRanchPromotions();
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
      const result = await upsertBuilderInventoryByExternalId({ ...row, developerName: BUILDER_NAME });
      if (result.created) {
        created++;
        await sql`
          UPDATE builder_inventory
          SET status = 'active',
              reviewed_at = NOW(),
              reviewed_by = 'system:scraper-trusted-srr-promotions'
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
    stripped,
    skipped: scrape.skipped,
    upsertErrors,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
