// app/api/cron/scrape-giddens-realtors/route.ts
//
// Daily cron entrypoint for the Giddens Homes realtor-promotion scraper.
// Source: https://giddenshomes.com/realtors/
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production.
// Dev/preview: open (so we can test from local without setting the secret).
//
// Output rows land as kind='promotion', status='pending' so a human reviews
// the realtor commission terms before publishing.

import { NextResponse } from 'next/server';
import { fetchGiddensPromotions } from '../../../../lib/scrapers/giddens-realtors';
import { upsertBuilderInventoryByExternalId } from '../../../../lib/builder-inventory';
import { withScraperRun } from '@/lib/with-scraper-run';

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
    scrape = await fetchGiddensPromotions();
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
      if (result.created) created++; else updated++;
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
    skipped: scrape.skipped,
    upsertErrors,
  });
}

async function _GET(req: Request)  { return handle(req); }
export async function POST(req: Request) { return handle(req); }

export const GET = withScraperRun('scrape-giddens-realtors', _GET);
