// caxton-mailing-v1
// GET /api/admin/mailing/sabor-realtors/status
// Returns the latest SABOR sync metadata + cookie freshness for the admin UI.

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SyncMetaRow {
  last_run_at: string | null;
  last_status: string | null;
  last_message: string | null;
  last_total: number | null;
  last_inserted: number | null;
  last_updated: number | null;
  last_errors: number | null;
  cookie_set_at: string | null;
}

export const GET = withErrorHandling(async () => {
  await requireAdmin();
  const sql = getSql();

  // Ensure the table exists (idempotent) so a fresh DB doesn't 500.
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

  const rows = (await sql`
    SELECT last_run_at, last_status, last_message,
           last_total, last_inserted, last_updated, last_errors,
           cookie_set_at
      FROM sabor_sync_meta
     WHERE id = 1
     LIMIT 1
  `) as unknown as SyncMetaRow[];

  const memberCountRow = (await sql`
    SELECT COUNT(*)::int AS c FROM mailing_contacts
     WHERE external_source = 'ramco-sabor'
  `) as unknown as Array<{ c: number }>;

  const meta = rows[0] ?? {
    last_run_at: null,
    last_status: null,
    last_message: null,
    last_total: null,
    last_inserted: null,
    last_updated: null,
    last_errors: null,
    cookie_set_at: null,
  };

  // We can't expose the cookie value, but we can confirm whether the
  // env vars are present so the admin can tell at a glance.
  const cookiePresent = Boolean(
    process.env.RAMCO_SABOR_SESSION_ID && process.env.RAMCO_SABOR_AUTH,
  );
  const ghDispatchConfigured = Boolean(
    process.env.GH_DISPATCH_TOKEN && process.env.GH_DISPATCH_REPO,
  );

  return NextResponse.json({
    ok: true,
    meta,
    member_count: memberCountRow[0]?.c ?? 0,
    cookie_present: cookiePresent,
    gh_dispatch_configured: ghDispatchConfigured,
  });
});
