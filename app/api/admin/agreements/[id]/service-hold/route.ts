// GET  — payment hold status for an agreement (eBlast / app / digital).
// POST — { action: 'release', note? } an admin confirms payment arrived
//        (check received, ACH cleared) or deliberately releases the hold.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { appendAudit, type Agreement } from '@/lib/agreements';
import { payAwaitingCheckInvoices } from '@/lib/agreements-v2/service-invoice';
import { SERVICE_PAYMENT_RELEASED_EVENT, getServiceHold } from '@/lib/agreements-v2/service-hold';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  await ensureSchema();
  const hold = await getServiceHold(getSql(), id);
  if (!hold) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(hold);
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: Ctx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  let body: { action?: string; note?: string } = {};
  try { body = await req.json(); } catch { /* none */ }
  if (body.action !== 'release') return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
    if (!rows[0]) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const paidCount = await payAwaitingCheckInvoices(sql, id, admin.email ?? null);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    const log = appendAudit(rows[0].audit_log, {
      event: SERVICE_PAYMENT_RELEASED_EVENT,
      timestamp: new Date().toISOString(),
      user_email: admin.email ?? undefined,
      details: `Payment confirmed by ${admin.email ?? 'admin'}; services released for scheduling.${paidCount ? ` ${paidCount} invoice(s) marked paid.` : ''}${note ? ` Note: ${note}` : ''}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(log)}::jsonb, updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'release failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
