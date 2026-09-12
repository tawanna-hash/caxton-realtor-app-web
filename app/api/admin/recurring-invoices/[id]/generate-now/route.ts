// app/api/admin/recurring-invoices/[id]/generate-now/route.ts
//
// POST — immediately generate the next invoice from a schedule, out of
// band from the daily cron. Useful for backfilling or testing.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { generateInvoiceFromSchedule } from '@/lib/server/recurring-invoices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`SELECT * FROM recurring_invoice_schedules WHERE id = ${id}`;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await generateInvoiceFromSchedule(sql, rows[0] as any);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: 'generate failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});
