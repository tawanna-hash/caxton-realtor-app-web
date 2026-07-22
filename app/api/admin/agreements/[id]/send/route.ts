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

    // Test-mode: recipient is FORCED to the current admin's email.
    // Never touches agreement.status / sent_to_email.
    const urlObj = new URL(req.url);
    const isTest =
      urlObj.searchParams.get('test') === '1' ||
      urlObj.searchParams.get('test') === 'true' ||
      body.test === true;

    const recipient = isTest
      ? admin.email
      : ((body.to as string | undefined) || ag.advertiser_email || ag.billing_email);
    if (!recipient) {
      return NextResponse.json({ error: isTest ? 'admin has no email in session' : 'no email address on agreement' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
    const token = signToken(id);
    const signingLink = `${siteUrl}/admin/billing/sign/${token}`;

    // Allow the admin to override the standard pitch with a custom
    // message typed into the drawer. Falls back to the boilerplate.
    const customMessage =
      typeof body.customMessage === 'string' && body.customMessage.trim().length > 0
        ? body.customMessage.trim()
        : null;
    const defaultMessage = `Your RealtyLine advertising proposal is ready for review. Click below to open your secure portal. Once you accept proposal it will convert to your advertising agreement. You will be able to select your placement start date before signing. If you need to change your preferred date after signing, just let me know and I will update it for you. As always, I'm happy to help should you have any questions or concerns.`;

    // Fetch line items so bundles show all lines in the email recap.
    type LineItemRow = {
      line_no: number;
      channel: 'print' | 'email' | 'app';
      package_label: string;
      ad_size: string | null;
      frequency: string | null;
      quantity: number;
      publication: 'austin' | 'san_antonio' | 'both' | null;
      start_date: string | null;
      end_date: string | null;
      amount_cents: number;
    };
    const lineItemRows = await sql`SELECT line_no, channel, package_label, ad_size, frequency, quantity, publication, start_date, end_date, amount_cents FROM agreement_line_items WHERE agreement_id = ${id} ORDER BY line_no ASC` as unknown as LineItemRow[];

    const notificationLines = lineItemRows.map((r) => ({
      lineNo: r.line_no,
      channel: r.channel,
      label: r.package_label,
      adSize: r.ad_size,
      frequency: r.frequency,
      quantity: r.quantity,
      publication: r.publication,
      startDate: r.start_date,
      endDate: r.end_date,
      amountCents: r.amount_cents,
    }));
    const totalCents = notificationLines.reduce((a, b) => a + b.amountCents, 0);

    // Extract the rep's typed note for the email. agreement.notes also carries
    // an auto-fallback ("Quote drafted — …") when the rep left it blank and an
    // appended override-pricing line for custom pricing — strip both so the
    // email only surfaces what the rep actually wrote.
    const repNote = (() => {
      const raw = (ag.notes ?? '').trim();
      if (!raw || raw.startsWith('Quote drafted —')) return null;
      const overrideLine = /^(Rack|Unit rack) \$[\d,]+(?:\.\d+)? → [Qq]uoted \$[\d,]+(?:\.\d+)? \(\d+(?:\.\d+)?% off\)$/;
      const kept = raw.split('\n').map((l) => l.trim()).filter((l) => l && !overrideLine.test(l));
      return kept.length ? kept.join('\n') : null;
    })();

    const html = agreementNotificationEmail({
      companyName: ag.company_name ?? undefined,
      repName: ag.rep_name ?? undefined,
      adSize: ag.ad_size ?? undefined,
      adRate: ag.ad_rate_cents != null ? ag.ad_rate_cents / 100 : null,
      status: ag.status,
      message: customMessage ?? defaultMessage,
      notes: repNote ?? undefined,
      signingLink,
      lines: notificationLines,
      totalCents,
    });

    const subject = isTest
      ? `[TEST] RealtyLine Agreement — ${ag.company_name ?? 'Agreement'}`
      : `Action Required: Sign Your RealtyLine Advertising Agreement — ${ag.company_name ?? 'Agreement'}`;
    const result = await sendEmail({
      to: recipient,
      subject,
      html,
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'email send failed', detail: result.error }, { status: 502 });
    }

    // Real send: update agreement status → sent, record sent_to_email.
    // Test send: skip both; just audit the test.
    if (!isTest) {
      await sql`UPDATE agreements SET status = 'sent', sent_to_email = ${recipient}, updated_at = NOW() WHERE id = ${id}`;
    }

    // Append audit entry (different event label for tests).
    const existingRows = await sql`SELECT audit_log FROM agreements WHERE id = ${id}` as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
    const newLog = appendAudit(existingRows[0]?.audit_log, {
      event: isTest ? 'email_test_sent' : 'email_sent',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: isTest
        ? `Test email sent to admin ${recipient}. Resend messageId: ${result.messageId ?? 'n/a'}`
        : `Agreement notification sent to ${recipient}. Resend messageId: ${result.messageId ?? 'n/a'}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    return NextResponse.json({ ok: true, messageId: result.messageId, sentTo: recipient, test: isTest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'send failed', detail: msg }, { status: 500 });
  }
}
