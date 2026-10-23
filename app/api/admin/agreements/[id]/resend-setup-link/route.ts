// POST — admin resends the secure payment-method setup link for a signed agreement.
// Body (optional): { email } to send to a different address than the one on file.
import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { resendSetupLink, ensurePaymentSetupRequestsSchema } from '@/lib/server/payment-setup-reminders';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* body optional */ }
  try {
    await ensureSchema();
    await ensurePaymentSetupRequestsSchema();
    const rows = (await getSql()`SELECT sent_to FROM payment_setup_requests WHERE agreement_id = ${id}`) as unknown as Array<{ sent_to: string }>;
    const typed = typeof body.email === 'string' ? body.email.trim() : '';
    const to = typed || rows[0]?.sent_to || '';
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return NextResponse.json({ error: 'No valid email on file. Enter one.' }, { status: 400 });
    const r = await resendSetupLink(id, to, `admin ${(admin as { email?: string }).email ?? ''}`.trim());
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, sentTo: r.sentTo });
  } catch (e) {
    console.error('[admin resend-setup-link]', e);
    return NextResponse.json({ error: 'Could not resend the link.' }, { status: 500 });
  }
});
