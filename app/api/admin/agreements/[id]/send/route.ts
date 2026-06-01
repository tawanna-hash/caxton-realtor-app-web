// app/api/admin/agreements/[id]/send/route.ts
//
// POST — Send agreement notification email with signing link.
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { agreementNotificationEmail } from '@/lib/email-templates';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
    const token = signToken(id);
    const signingLink = `${siteUrl}/admin/billing/sign/${token}`;

    const html = agreementNotificationEmail({
      companyName: ag.company_name ?? undefined,
      repName: ag.rep_name ?? undefined,
      adSize: ag.ad_size ?? undefined,
      adRate: ag.ad_rate_cents != null ? ag.ad_rate_cents / 100 : null,
      status: ag.status,
      message: `Please review and sign your advertising agreement with RealtyLine. Click the button below to access your secure signing link.`,
      signingLink,
    });

    const result = await sendEmail({
      to: recipient,
      subject: `Action Required: Sign Your RealtyLine Advertising Agreement — ${ag.company_name ?? 'Agreement'}`,
      html,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'email send failed', detail: result.error }, { status: 502 });
    }

    // Update agreement status → sent, record sent_to_email
    await sql`UPDATE agreements SET status = 'sent', sent_to_email = ${recipient}, updated_at = NOW() WHERE id = ${id}`;

    // Append audit entry
    const existingRows = await sql`SELECT audit_log FROM agreements WHERE id = ${id}` as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
    const newLog = appendAudit(existingRows[0]?.audit_log, {
      event: 'email_sent',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: `Agreement notification sent to ${recipient}. Resend messageId: ${result.messageId ?? 'n/a'}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    return NextResponse.json({ ok: true, messageId: result.messageId, sentTo: recipient });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'send failed', detail: msg }, { status: 500 });
  }
}
