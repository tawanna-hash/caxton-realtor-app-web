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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SENDERS = {
  'tawanna@myrealtyline.com': 'Tawanna Verock <tawanna@myrealtyline.com>',
  'tawanna@newslinesa.com': 'Tawanna Verock <tawanna@newslinesa.com>',
  'hello@myrealtyline.com': 'Caxton Publications Inc. <hello@myrealtyline.com>',
} as const;

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
    const fromKey =
      body.from && body.from in SENDERS
        ? (body.from as keyof typeof SENDERS)
        : 'hello@myrealtyline.com';

    const refreshed = await refreshPartnerStatementLinks({
      ...original,
      recipientEmail: recipient,
      billToEmail: original.billToEmail ?? recipient,
    });
    const rendered = renderPartnerStatementEmail(refreshed, message);
    const pdf = await generatePartnerStatementPdf(refreshed);
    const result = await sendEmail({
      to: recipient,
      from: SENDERS[fromKey],
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

    for (const invoice of refreshed.invoices) revalidateInvoiceViews(invoice.id);
    return NextResponse.json({
      sent: true,
      recipient,
      invoice_count: refreshed.invoices.length,
      message_id: result.messageId ?? null,
    });
  } catch (error) {
    console.error('[admin/advertisers/:id/send-statement]', error);
    return NextResponse.json(
      { error: 'statement failed', detail: error instanceof Error ? error.message : 'error' },
      { status: 500 },
    );
  }
});
