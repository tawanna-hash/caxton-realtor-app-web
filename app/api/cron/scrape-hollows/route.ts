// app/api/cron/scrape-hollows/route.ts
//
// Daily cron entrypoint for The Hollows at Lake Travis (developer) Quick
// Move-In homes scraper. Source: hollowslaketravis.com/available-homes/.
//
// Auth: Authorization: Bearer ${CRON_SECRET} in production. Dev/preview: open.
//
// ?strip=1 — deletes ALL existing Hollows-developer showcase rows before
// upserting. Use for full re-seeds.
//
// Multi-builder attribution (mirrors santa-rita-ranch):
//   - Rows are tagged with the ACTUAL homebuilder in `builder_name`
//     (Drees Custom Homes / Giddens Homes / Silverton Custom Homes /
//     Younger Homes).
//   - Every row also carries `developer_name = 'The Hollows at Lake Travis'`
//     so all homes group on the developer hub.
//   - Prune runs per-builder against the current feed.

import { NextRequest, NextResponse } from 'next/server';
import { fetchHollows } from '@/lib/scrapers/hollows';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DEVELOPER_NAME = 'The Hollows at Lake Travis';

function verifyCronAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!isProduction) return { ok: true };
  if (!expected) return { ok: false, reason: 'CRON_SECRET not configured' };
  if (got !== `Bearer ${expected}`) {
    return { ok: false, reason: 'Bad or missing Authorization header' };
  }
  return { ok: true };
}

async function stripExistingRows(): Promise<number> {
  const result = await sql`
    DELETE FROM builder_inventory
    WHERE developer_name = ${DEVELOPER_NAME}
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
      stripped = await stripExistingRows();
      console.log(`[scrape-hollows] stripped ${stripped} existing rows`);
    } catch (err) {
      console.error(
        '[scrape-hollows] strip failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  let scrape;
  try {
    scrape = await fetchHollows();
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
      const result = await upsertBuilderInventoryByExternalId({
        ...row,
        developerName: DEVELOPER_NAME,
      });
      if (result.created) created++;
      else updated++;
    } catch (err) {
      upsertErrors.push({
        externalId: row.externalId,
        reason: (err as Error).message,
      });
    }
  }

  // Prune: deactivate Hollows-tagged showcase rows no longer in the feed.
  //
  // Scoped to `developer_name = DEVELOPER_NAME` so we never touch Drees /
  // Giddens / Silverton listings that came from those builders' own
  // scrapers (which don't set developer_name).
  //
  // Guarded on scrape.rows.length > 0 — a transient empty response must
  // not deactivate the whole set.
  let deactivated = 0;
  if (scrape.rows.length > 0 && !strip) {
    const activeIds = scrape.rows
      .filter((r) => r.homeType === 'showcase')
      .map((r) => r.externalId);
    if (activeIds.length > 0) {
      const rows = await sql`
        UPDATE builder_inventory
        SET status = 'expired'
        WHERE developer_name = ${DEVELOPER_NAME}
          AND home_type      = 'showcase'
          AND kind           = 'listing'
          AND status         = 'active'
          AND external_id IS NOT NULL
          AND external_id <> ALL (${activeIds}::text[])
        RETURNING id
      `;
      deactivated = Array.isArray(rows) ? rows.length : 0;
    }
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
