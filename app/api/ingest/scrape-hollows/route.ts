// app/api/ingest/scrape-hollows/route.ts
//
// Ingest endpoint for The Hollows QMI feed. Called by the GitHub Actions
// job at scripts/scrape-hollows.mjs, not by Vercel cron — hollowslaketravis.com's
// Cloudflare blocks Vercel's outbound IPs.
//
// Auth: Authorization: Bearer ${INGEST_SECRET}. Required in ALL envs
// (not just production) since this is an unauthenticated public route
// that writes to the DB.
//
// Body: { rawCount: number, rows: UpsertScrapedInput[], skipped: {externalId, reason}[] }
//
// ?strip=1 — deletes ALL existing Hollows-developer showcase rows before upserting.
// Prune: deactivates stale showcase rows not in the current feed. Scoped to
// developer_name = 'The Hollows at Lake Travis' so it never touches Drees /
// Giddens / Silverton listings imported from those builders' own scrapers.

import { NextRequest, NextResponse } from 'next/server';
import { upsertBuilderInventoryByExternalId } from '@/lib/builder-inventory';
import type { UpsertScrapedInput } from '@/lib/builder-inventory';
import { neon } from '@neondatabase/serverless';
import { recordScraperRun } from '@/lib/scraper-runs';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const DEVELOPER_NAME = 'The Hollows at Lake Travis';

function verifyIngestAuth(req: NextRequest): { ok: boolean; reason?: string } {
  // Accept EITHER the generic INGEST_SECRET (shared across future
  // ingesters) OR HOLLOWS_INGEST_SECRET (Hollows-only, used by the
  // Perplexity-side scheduled task — smaller blast radius).
  const generic = process.env.INGEST_SECRET;
  const hollows = process.env.HOLLOWS_INGEST_SECRET;
  if (!generic && !hollows) {
    return { ok: false, reason: 'no ingest secret configured' };
  }
  const got = req.headers.get('authorization');
  if (!got) return { ok: false, reason: 'missing Authorization header' };
  if (generic && got === `Bearer ${generic}`) return { ok: true };
  if (hollows && got === `Bearer ${hollows}`) return { ok: true };
  return { ok: false, reason: 'bad Authorization header' };
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

type IngestBody = {
  rawCount?: number;
  rows?: UpsertScrapedInput[];
  skipped?: { externalId: string | null; reason: string }[];
};

export async function POST(req: NextRequest) {
  const auth = verifyIngestAuth(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.reason ?? 'unauthorized' },
      { status: 401 },
    );
  }

  const startedAt = Date.now();

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON body' }, { status: 400 });
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const rawCount = typeof body.rawCount === 'number' ? body.rawCount : rows.length;
  const skipped = Array.isArray(body.skipped) ? body.skipped : [];

  const strip = new URL(req.url).searchParams.get('strip') === '1';

  let stripped = 0;
  if (strip) {
    try {
      stripped = await stripExistingRows();
      console.log(`[ingest-hollows] stripped ${stripped} existing rows`);
    } catch (err) {
      console.error(
        '[ingest-hollows] strip failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  let created = 0;
  let updated = 0;
  const upsertErrors: { externalId: string; reason: string }[] = [];

  for (const row of rows) {
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
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Prune: deactivate Hollows-tagged showcase rows no longer in the feed.
  // Guarded on rows.length > 0 so a transient empty feed never nukes the set.
  let deactivated = 0;
  if (rows.length > 0 && !strip) {
    const activeIds = rows
      .filter((r) => r.homeType === 'showcase')
      .map((r) => r.externalId);
    if (activeIds.length > 0) {
      const pruned = await sql`
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
      deactivated = Array.isArray(pruned) ? pruned.length : 0;
    }
  }

  await recordScraperRun({
    scraperPath: 'scrape-hollows',
    durationMs: Date.now() - startedAt,
    status: upsertErrors.length > 0 ? 'error' : (rows.length === 0 ? 'skipped' : 'ok'),
    rowCount: rows.length - upsertErrors.length,
    rawCount,
    created,
    updated,
    deactivated,
    errorMessage: upsertErrors.length > 0
      ? `${upsertErrors.length} upsert error(s): ${upsertErrors.slice(0, 3).map((e) => e.reason).join('; ')}`
      : null,
  });

  return NextResponse.json({
    ok: true,
    ms: Date.now() - startedAt,
    rawCount,
    upserted: rows.length,
    created,
    updated,
    stripped,
    deactivated,
    skipped,
    upsertErrors,
  });
}
