// app/api/cron/scrape-santa-rita-ranch/route.ts
//
// Daily cron entrypoint for the Santa Rita Ranch (developer) move-in-ready
// homes scraper. Source: santaritaranchaustin.com Pipsy API.
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
//
// ?strip=1 — deletes ALL existing SRR showcase rows before upserting.
// Prune: deactivates stale showcase rows not in the current feed.
//
// Output rows land as kind='listing' (auto-active) — these are public
// listings already filtered by Pipsy to "Available".

import { NextRequest, NextResponse } from 'next/server';
import { fetchSantaRitaRanch } from '@/lib/scrapers/santa-rita-ranch';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

async function stripExistingShowcase(): Promise<number> {
  const result = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = ${BUILDER_NAME}
      AND home_type = 'showcase'
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
      stripped = await stripExistingShowcase();
      console.log(`[scrape-santa-rita-ranch] stripped ${stripped} existing showcase rows`);
    } catch (err) {
      console.error('[scrape-santa-rita-ranch] strip failed:', err instanceof Error ? err.message : String(err));
    }
  }

  let scrape;
  try {
    scrape = await fetchSantaRitaRanch();
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `scrape failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  let created = 0;
  let updated = 0;
  const upsertErrors: { externalId: string; reason: string }[] = [];

  for (const row of scrape.rows) {
    try {
      const result = await upsertBuilderInventoryByExternalId(row);
      if (result.created) created++;
      else updated++;
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Prune: deactivate showcase homes no longer in the source feed.
  let deactivated = 0;
  if (scrape.rows.length > 0 && !strip) {
    deactivated = await deactivateStaleBuilderInventory({
      builderName: BUILDER_NAME,
      homeType: 'showcase',
      activeExternalIds: scrape.rows.map((r) => r.externalId),
    });
  }

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    rawCount: scrape.rawCount,
    upserted: scrape.rows.length,
    created,
    updated,
    stripped,
    deactivated,
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
