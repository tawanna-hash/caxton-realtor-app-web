import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { generatePartnerStatementPdf } from '@/lib/partner-statement-pdf';
import {
  loadPartnerStatement,
  refreshPartnerStatementLinks,
  renderPartnerStatementEmail,
} from '@/lib/server/partner-statement';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { getSql } from '@/lib/db';
import {
  DEFAULT_EMAIL_SENDER,
  EMAIL_SENDERS,
  type EmailSenderAddress,
} from '@/lib/email-sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const advertiserId = Number(id);
  if (!Number.isInteger(advertiserId) || advertiserId < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let body: { from?: string; to?: string; subject?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (body.from?.trim() && !(body.from.trim() in EMAIL_SENDERS)) {
    return NextResponse.json(
      { error: 'The selected From address is not verified for email delivery.' },
      { status: 400 },
    );
  }

  try {
    const original = await loadPartnerStatement(advertiserId);
    if (!original) {
      return NextResponse.json(
        { error: 'no outstanding invoices found for this partner' },
        { status: 404 },
      );
    }
    const recipient = body.to?.trim() || original.recipientEmail;
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return NextResponse.json({ error: 'a valid recipient email is required' }, { status: 400 });
    }
    const subject = body.subject?.trim() || 'Statement of Account from Caxton Publications, Inc.';
    const message =
      body.message?.trim() ||
      `Dear ${original.advertiserName},\n\nPlease find your current Statement of Account below and attached as a PDF.`;
    const fromKey: EmailSenderAddress =
      body.from && body.from.trim() in EMAIL_SENDERS
        ? (body.from.trim() as EmailSenderAddress)
        : DEFAULT_EMAIL_SENDER;

    const refreshed = await refreshPartnerStatementLinks({
      ...original,
      recipientEmail: recipient,
      billToEmail: original.billToEmail ?? recipient,
    });
    const rendered = renderPartnerStatementEmail(refreshed, message);
    const pdf = await generatePartnerStatementPdf(refreshed);
    const result = await sendEmail({
      to: recipient,
      from: EMAIL_SENDERS[fromKey],
      replyTo: fromKey,
      subject,
      html: rendered.html,
      attachments: [
        {
          filename: `statement-${refreshed.advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
          content: Buffer.from(pdf).toString('base64'),
          contentType: 'application/pdf',
        },
      ],
    });
    if (!result.ok) {
      return NextResponse.json({ error: 'send failed', detail: result.error }, { status: 502 });
    }

    const sql = getSql();
    const historyRows = (await sql`
      INSERT INTO statement_send_history (
        advertiser_id, advertiser_name, recipient_email, sender_email,
        subject, sent_by, message_id, statement_as_of, invoice_count,
        outstanding_cents, payment_links_refreshed, invoice_ids
      ) VALUES (
        ${refreshed.advertiserId}, ${refreshed.advertiserName}, ${recipient},
        ${fromKey}, ${subject}, ${admin.email}, ${result.messageId ?? null},
        ${refreshed.asOf}, ${refreshed.invoices.length},
        ${refreshed.outstandingCents}, ${refreshed.invoices.length},
        ${JSON.stringify(refreshed.invoices.map((invoice) => invoice.id))}::jsonb
      )
      RETURNING id, sent_at
    `) as unknown as Array<{ id: string; sent_at: string | Date }>;
    const history = historyRows[0];

    for (const invoice of refreshed.invoices) revalidateInvoiceViews(invoice.id);
    return NextResponse.json({
      sent: true,
      recipient,
      invoice_count: refreshed.invoices.length,
      message_id: result.messageId ?? null,
      history_id: history?.id ?? null,
      sent_at: history?.sent_at ?? new Date().toISOString(),
    });
  } catch (error) {
    console.error('[admin/advertisers/:id/send-statement]', error);
    return NextResponse.json(
      { error: 'statement failed', detail: error instanceof Error ? error.message : 'error' },
      { status: 500 },
    );
  }
});
