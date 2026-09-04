// app/api/admin/agreements/[id]/send/route.ts
//
// POST — Send agreement notification email with signing link.
// Auth: admin required.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { signToken } from '@/lib/sign-token';
import { sendEmail } from '@/lib/email';
import { agreementNotificationEmail, brandForPublication } from '@/lib/email-templates';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { cleanRepNote } from '@/lib/agreement-notes';
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
  try { body = await req.json(); } catch { /* no body is fine */ }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = await sql`SELECT * FROM agreements WHERE id = ${id}` as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    // Test-mode: recipient is always the Realty News Now monitored test inbox.
    // Never touches agreement.status / sent_to_email.
    const urlObj = new URL(req.url);
    const isTest =
      urlObj.searchParams.get('test') === '1' ||
      urlObj.searchParams.get('test') === 'true' ||
      body.test === true;

    const recipient = isTest
      ? 'tawanna@myrealtyline.com'
      : ((body.to as string | undefined) || ag.advertiser_email || ag.billing_email);
    if (!recipient) {
      return NextResponse.json({ error: 'no email address on agreement' }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://realtynewsnow.app';
    const token = signToken(id);
    const signingLink = `${siteUrl}/admin/billing/sign/${token}`;

    // Allow the admin to override the standard pitch with a custom
    // message typed into the drawer. Falls back to the boilerplate.
    const brand = brandForPublication(ag.publication);

    // Two-stage insertion-order flow:
    //   stage='proposal'  -> status proposal_sent  (client reviews/edits IO, no signature)
    //   stage='agreement' -> status sent          (final IO, legal terms + sign)
    const stage = body.stage === 'proposal' ? 'proposal' : 'agreement';
    const isProposalStage = stage === 'proposal';
    const customMessage =
      typeof body.customMessage === 'string' && body.customMessage.trim().length > 0
        ? body.customMessage.trim()
        : null;
    const defaultMessage = isProposalStage
      ? `Your ${brand.brandName} advertising insertion order is ready for review. Confirm the company name, select your preferred send date and up to three optional dates when applicable, review the placement and markets, then approve it. Nothing is binding until the final insertion order is signed. As always, I'm happy to help should you have any questions or concerns.`
      : `Your ${brand.brandName} advertising insertion order is ready for your review and signature. Click below to open your secure portal, confirm your preferred send date and up to three optional dates when applicable, and sign. The insertion order becomes a binding advertising agreement when signed. As always, I'm happy to help should you have any questions or concerns.`;

    // Fetch line items so bundles show all lines in the email recap.
    type LineItemRow = {
      line_no: number;
      channel: 'print' | 'email' | 'app';
      package_label: string;
      ad_size: string | null;
      frequency: string | null;
      quantity: number;
      publication: import('@/lib/publications').PublicationScope | null;
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
    const repNote = cleanRepNote(ag.notes);

    const html = agreementNotificationEmail({
      brand,
      companyName: ag.company_name ?? undefined,
      repName: ag.rep_name ?? undefined,
      adSize: ag.ad_size ?? undefined,
      adRate: ag.ad_rate_cents != null ? ag.ad_rate_cents / 100 : null,
      adRateUnit: ag.type === 'eblast' ? 'send' : 'issue',
      status: isProposalStage ? 'proposal_sent' : 'sent',
      message: customMessage ?? defaultMessage,
      notes: repNote ?? undefined,
      signingLink,
      lines: notificationLines,
      totalCents,
    });

    const subject = isTest
      ? `[TEST] ${brand.brandName} Insertion Order — ${ag.company_name ?? 'Insertion Order'}`
      : isProposalStage
        ? `Action Required: Review Your ${brand.brandName} Advertising Insertion Order — ${ag.company_name ?? 'Insertion Order'}`
        : `Action Required: Sign Your ${brand.brandName} Advertising Insertion Order — ${ag.company_name ?? 'Insertion Order'}`;
    const isNewslineSender =
      ag.publication === 'san_antonio'
      || ag.company_name?.trim().toLowerCase() === 'newsline san antonio';
    let result = await sendEmail({
      to: recipient,
      from: isNewslineSender ? 'Newsline San Antonio <hello@newslinesa.com>' : undefined,
      replyTo: isNewslineSender ? 'hello@newslinesa.com' : undefined,
      subject,
      html,
    });

    // Keep Newsline mail deliverable while its Resend domain verification is
    // pending. The rejected attempt does not send; retry once from the verified
    // RealtyLine default while preserving Newsline branding and reply handling.
    // As soon as newslinesa.com is verified, the first attempt succeeds and this
    // fallback is bypassed automatically.
    const newslineDomainUnverified =
      isNewslineSender
      && !result.ok
      && /newslinesa\.com domain is not verified/i.test(result.error ?? '');
    if (newslineDomainUnverified) {
      result = await sendEmail({
        to: recipient,
        replyTo: 'hello@newslinesa.com',
        subject,
        html,
      });
    }

    if (!result.ok) {
      return NextResponse.json({ error: 'email send failed', detail: result.error }, { status: 502 });
    }

    // Real send: update agreement status → sent, record sent_to_email.
    // Test send: skip both; just audit the test.
    if (!isTest) {
      const newStatus = isProposalStage ? 'proposal_sent' : 'sent';
      await sql`UPDATE agreements SET status = ${newStatus}, sent_to_email = ${recipient}, updated_at = NOW() WHERE id = ${id}`;
    }

    // Append audit entry (different event label for tests).
    const existingRows = await sql`SELECT audit_log FROM agreements WHERE id = ${id}` as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
    const newLog = appendAudit(existingRows[0]?.audit_log, {
      event: isTest
        ? (isProposalStage ? 'proposal_email_test' : 'email_test_sent')
        : (isProposalStage ? 'proposal_sent' : 'agreement_sent'),
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: isTest
        ? `Test insertion order email sent to admin ${recipient}. Resend messageId: ${result.messageId ?? 'n/a'}`
        : `Insertion order notification sent to ${recipient}. Resend messageId: ${result.messageId ?? 'n/a'}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${id}`;

    return NextResponse.json({ ok: true, messageId: result.messageId, sentTo: recipient, test: isTest, stage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: 'send failed', detail: msg }, { status: 500 });
  }
});
