// app/api/admin/agreements/sync-bundle-amounts/route.ts
//
// One-time / maintenance sync. For every agreement that has line items,
// set amount_cents = SUM(agreement_line_items.amount_cents) where the stored
// value doesn't already match. Fixes bundle agreements whose amount_cents was
// clobbered by a single-line drawer edit (e.g. an app+e-Blast bundle showing
// "Invoiced $980 of $95" because amount_cents held only the e-Blast rate).
//
// Idempotent — only writes rows that actually mismatch. The PATCH route now
// enforces this invariant on every save, so this is mainly to repair existing
// rows. Trigger once by visiting the URL (GET) or POSTing.
//
// Auth: requireAdmin().

import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function runSync() {
  await ensureSchema();
  const sql = getSql();
  const updated = await sql`
    UPDATE agreements a
       SET amount_cents = s.sum_cents, updated_at = NOW()
      FROM (
        SELECT agreement_id, SUM(amount_cents)::int AS sum_cents
          FROM agreement_line_items
         GROUP BY agreement_id
      ) s
     WHERE a.id = s.agreement_id
       AND a.amount_cents IS DISTINCT FROM s.sum_cents
    RETURNING a.id, a.company_name, a.amount_cents
  `;
  return updated as unknown as Array<{ id: string; company_name: string | null; amount_cents: number | null }>;
}

export const GET = withErrorHandling(async () => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await runSync();
  return NextResponse.json({ updated: rows.length, rows });
});

export const POST = withErrorHandling(async () => {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = await runSync();
  return NextResponse.json({ updated: rows.length, rows });
});
