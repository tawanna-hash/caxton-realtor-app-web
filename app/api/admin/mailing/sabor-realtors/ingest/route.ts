// caxton-mailing-v1
// Ingest endpoint for SABOR realtor records.
//
// Designed to be called by the long-running GitHub Actions scraper job:
//   POST /api/admin/mailing/sabor-realtors/ingest
//   Authorization: Bearer $CRON_SECRET
//   Content-Type: application/json
//   Body: { records: SaborMemberRecord[] }
//
// The endpoint accepts batches of up to 500 records per call. Records are
// passed through to upsertHoldingContacts with external_source='ramco-sabor'
// and segment='realtor', and the timestamp of the last successful ingest is
// stored in the sabor_sync_meta table for the admin freshness indicator.

import { NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { upsertHoldingContacts } from '@/lib/mailing';
import type { SaborMemberRecord } from '@/lib/sabor-realtor-scraper';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BATCH = 500;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

async function ensureSyncMetaTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS sabor_sync_meta (
      id            INTEGER PRIMARY KEY DEFAULT 1,
      last_run_at   TIMESTAMPTZ,
      last_status   TEXT,
      last_message  TEXT,
      last_total    INTEGER,
      last_inserted INTEGER,
      last_updated  INTEGER,
      last_errors   INTEGER,
      cookie_set_at TIMESTAMPTZ,
      CONSTRAINT sabor_sync_meta_singleton CHECK (id = 1)
    )
  `;
  await sql`INSERT INTO sabor_sync_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
}

async function recordSync(opts: {
  status: 'success' | 'error';
  message?: string;
  total?: number;
  inserted?: number;
  updated?: number;
  errors?: number;
}): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE sabor_sync_meta SET
      last_run_at   = NOW(),
      last_status   = ${opts.status},
      last_message  = ${opts.message ?? null},
      last_total    = ${opts.total ?? null},
      last_inserted = ${opts.inserted ?? null},
      last_updated  = ${opts.updated ?? null},
      last_errors   = ${opts.errors ?? null}
    WHERE id = 1
  `;
}

interface IngestBody {
  records?: SaborMemberRecord[];
  /** Optional run summary metadata reported by the scraper. */
  summary?: {
    memberIdsFound?: number;
    pagesScraped?: number;
    detailsFetched?: number;
    errors?: number;
    truncated?: boolean;
  };
  /** When true, do not record this batch as the canonical "last run" \u2014
   * useful for chunked uploads where only the final batch carries summary. */
  partial?: boolean;
}

export const POST = withAdminTracking(async function POST(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, message: 'CRON_SECRET env var is not set.' },
      { status: 500 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: 'Invalid JSON body.' },
      { status: 400 },
    );
  }

  const records = Array.isArray(body.records) ? body.records : [];
  if (records.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, message: `Batch too large; max ${MAX_BATCH} records per call.` },
      { status: 400 },
    );
  }

  await ensureSchema();
  await ensureSyncMetaTable();

  let upsert = { inserted: 0, updated: 0, unchanged: 0 };
  if (records.length > 0) {
    upsert = await upsertHoldingContacts(
      records.map((r) => ({
        external_id: r.external_id,
        external_source: r.external_source,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        phone: r.phone,
        mobile_phone: r.mobile,
        company: r.company,
        title: r.title,
        license_number: r.license_number,
        address: r.address,
        city: r.city,
        state: r.state,
        zip: r.zip,
        segment: 'realtor',
        source: 'ramco-sabor',
      })),
    );
  }

  // Only stamp last_run_at when this is the final/complete batch.
  if (!body.partial) {
    const total = body.summary?.detailsFetched ?? records.length;
    const errors = body.summary?.errors ?? 0;
    await recordSync({
      status: errors > 0 && total === 0 ? 'error' : 'success',
      message:
        body.summary?.truncated
          ? 'Run completed but was truncated (page or record cap reached).'
          : undefined,
      total,
      inserted: upsert.inserted,
      updated: upsert.updated,
      errors,
    });
  }

  return NextResponse.json({
    ok: true,
    received: records.length,
    ...upsert,
  });
});
