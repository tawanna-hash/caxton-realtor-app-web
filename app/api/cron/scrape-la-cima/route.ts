// app/api/cron/scrape-la-cima/route.ts
//
// Daily cron entrypoint for the La Cima (developer) move-in-ready
// homes scraper. Source: lacimatx.com Pipsy API (public1.pipsy.io)
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open.
//
// Output rows land as kind='listing' (auto-active) — these are public
// inventory homes already curated by the developer.
//
// Prune: deactivates stale showcase rows per builder (not the developer
// umbrella) so each builder's inventory stays in sync independently.

import { NextResponse, type NextRequest } from 'next/server';
import { fetchLaCima } from '@/lib/scrapers/la-cima';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { deactivateStaleBuilderInventory } from '@/lib/builder-inventory-sync';
import { withScraperRun } from '@/lib/with-scraper-run';

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
    scrape = await fetchLaCima();
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
      const result = await upsertBuilderInventoryByExternalId({ ...row, developerName: 'La Cima' });
      if (result.created) created++; else updated++;
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Prune stale showcase rows per builder (same pattern as SRR).
  let deactivated = 0;
  const showcaseRows = scrape.rows.filter((r) => r.homeType === 'showcase');
  if (showcaseRows.length > 0) {
    const byBuilder = new Map<string, string[]>();
    for (const r of showcaseRows) {
      const bn = r.builderName ?? 'La Cima';
      if (!byBuilder.has(bn)) byBuilder.set(bn, []);
      byBuilder.get(bn)!.push(r.externalId);
    }
    for (const [bn, ids] of byBuilder) {
      deactivated += await deactivateStaleBuilderInventory({
        builderName: bn,
        homeType: 'showcase',
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
    deactivated,
    skipped: scrape.skipped,
    upsertErrors,
  });
}

async function _GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

export const GET = withScraperRun('scrape-la-cima', _GET);
