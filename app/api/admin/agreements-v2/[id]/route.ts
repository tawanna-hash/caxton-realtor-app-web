// app/api/admin/agreements-v2/[id]/route.ts
//
// Agreements (Beta). POST { action: 'create_schedule' } — create the draft
// (paused) recurring schedule for a signed agreement that does not have one.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { saveAgreementMeta } from '@/lib/agreements-v2/builder';
import { timelinesForAgreement } from '@/lib/agreements-v2/timeline';
import { cleanBilling, cleanPayment } from '@/lib/agreements-v2/service-billing';
import { createDraftScheduleForAgreement } from '@/lib/agreements-v2/recurring-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withAdminTracking(async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional */ }
  if (body.action === 'save_meta') {
    try {
      await ensureSchema();
      const m = (body.meta ?? {}) as Record<string, unknown>;
      const str = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
      const days = typeof m.expires_days === 'number' && m.expires_days > 0 && m.expires_days <= 365 ? Math.round(m.expires_days) : null;
      const expires = days ? new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10) : null;
      const refs = Array.isArray(m.refs) ? (m.refs as Array<Record<string, unknown>>).filter((r) => typeof r.name === 'string' && r.name.trim()).slice(0, 20).map((r) => ({ name: String(r.name).slice(0, 80), value: String(r.value ?? '').slice(0, 300), client_facing: r.client_facing === true })) : [];
      const services = Array.isArray(m.services) ? (m.services as Array<Record<string, unknown>>).slice(0, 30).map((x) => ({ line_no: Number(x.line_no) || 0, name: String(x.name ?? '').slice(0, 160), description: String(x.description ?? '').slice(0, 4000), ...(x.billing ? { billing: cleanBilling(x.billing as never) } : {}) })).filter((x) => x.line_no > 0) : [];
      await saveAgreementMeta(id, { name: str(m.name, 160), intro: str(m.intro, 4000), note: str(m.note, 4000), expires_at: expires, ask_address: m.ask_address === true, refs, services, payment: m.payment ? cleanPayment(m.payment as never) : null }, getSql());
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
    }
  }
  if (body.action === 'timeline') {
    try {
      await ensureSchema();
      const t = await timelinesForAgreement(getSql(), id);
      if (!t) return NextResponse.json({ error: 'not found' }, { status: 404 });
      return NextResponse.json(t);
    } catch (err) {
      return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
    }
  }
  if (body.action !== 'create_schedule') return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  try {
    await ensureSchema();
    const res = await createDraftScheduleForAgreement(getSql(), id, admin.email ?? null);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.reason }, { status: 422 });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: 'failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
});
