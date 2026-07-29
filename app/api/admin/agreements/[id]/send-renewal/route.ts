// app/api/admin/agreements/[id]/send-renewal/route.ts
//
// POST — Send renewal email with signing link.
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { renewalEmail } from '@/lib/email-templates';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

function getDaysUntil(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(iso.slice(0, 10)); e.setHours(0, 0, 0, 0);
  return Math.round((e.getTime() - t.getTime()) / 86400000);
}

function humanDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional body */ }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    const recipient = (body.to as string | undefined) || ag.advertiser_email || ag.billing_email;
    if (!recipient) {
      return NextResponse.json({ error: 'no email address on agreement' }, { status: 400 });
    }

    const expDate = ag.exp_date ?? ag.end_date;
    const daysRemaining = getDaysUntil(expDate);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
    const token = signToken(id);
    const signingLink = `${siteUrl}/admin/billing/sign/${token}`;

    const html = renewalEmail({
      companyName: ag.company_name ?? undefined,
      repName: ag.rep_name ?? undefined,
      expirationDate: humanDate(expDate),
      daysRemaining,
      adSize: ag.ad_size ?? undefined,
      frequency: ag.frequency ?? undefined,
      adRate: ag.ad_rate_cents != null ? ag.ad_rate_cents / 100 : 0,
      signingLink,
    });

    const result = await sendEmail({
      to: recipient,
      subject: `Renewal Notice: Your RealtyLine Advertising Agreement — ${ag.company_name ?? 'Agreement'}`,
      html,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'email send failed', detail: result.error }, { status: 502 });
    }

    // Append audit entry
    const existingRows = await sql`SELECT audit_log FROM agreements WHERE id = ${id}` as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
    const newLog = appendAudit(existingRows[0]?.audit_log, {
      event: 'renewal_email_sent',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: `Renewal email sent to ${recipient}. Days remaining: ${daysRemaining}. Resend messageId: ${result.messageId ?? 'n/a'}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    captureServerEvent('renewal_email_sent', admin?.email ?? 'server', {
      surface: 'admin_agreements',
      agreement_id: id,
      recipient,
      message_id: result.messageId,
      source: 'send-renewal',
    });
    await flushServerEvents();
    return NextResponse.json({ ok: true, messageId: result.messageId, sentTo: recipient });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'send-renewal failed', detail: msg }, { status: 500 });
  }
});
