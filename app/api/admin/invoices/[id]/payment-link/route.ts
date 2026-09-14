// app/api/admin/invoices/[id]/payment-link/route.ts
//
// POST — staff generates (or refreshes) a hosted Stripe Checkout link for
// an invoice and stores it on invoices.stripe_payment_link_url. Optionally
// emails a `pay_invoice` portal magic link to the advertiser in the same
// call (send_email: true, default true) so they land straight on the
// embedded pay page rather than the raw Stripe URL.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { paymentMethodLabel, processingFeeCents } from '@/lib/payment-processing-fees';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import {
  generateMagicLinkToken,
  hashMagicLinkToken,
  PORTAL_LINK_TTL_MS,
} from '@/lib/portal';
import { Resend } from 'resend';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';
const INVOICE_SENDERS = {
  'tawanna@myrealtyline.com': 'Tawanna Verock <tawanna@myrealtyline.com>',
  'hello@myrealtyline.com': 'Caxton Publications Inc. <hello@myrealtyline.com>',
} as const;
type InvoiceSender = keyof typeof INVOICE_SENDERS;

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  total_cents: number;
  advertiser_id: number | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  memo: string | null;
  due_date: string | null;
}

export const POST = withAdminTracking(async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* optional body */ }
  const sendEmail = body.send_email !== false;
  const emailMode = body.email_mode === 'reminder' ? 'reminder' : 'invoice';

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, number, status, total_cents, advertiser_id, bill_to_name, bill_to_email, memo, due_date
      FROM invoices WHERE id = ${id}
    `) as unknown as InvoiceRow[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const inv = rows[0];
    if (inv.status === 'paid') return NextResponse.json({ error: 'invoice already paid' }, { status: 400 });
    if (inv.status === 'void') return NextResponse.json({ error: 'invoice is void' }, { status: 400 });
    if (!inv.total_cents || inv.total_cents <= 0) {
      return NextResponse.json({ error: 'invoice has no amount due' }, { status: 400 });
    }

    const stripe = getStripe();
    const feeCents = processingFeeCents(inv.total_cents, 'card');
    const chargeCents = inv.total_cents + feeCents;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: inv.bill_to_email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: inv.total_cents,
            product_data: {
              name: `Invoice ${inv.number}`,
              description: inv.memo ?? 'RealtyLine advertising invoice',
            },
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: 'usd',
            unit_amount: feeCents,
            product_data: {
              name: `${paymentMethodLabel('card')} processing fee`,
              description: 'Processing fee disclosed before payment authorization',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${APP_BASE_URL}/portal/invoices/${inv.id}?paid=1`,
      cancel_url: `${APP_BASE_URL}/portal/invoices/${inv.id}?canceled=1`,
      metadata: {
        source: 'invoice_payment',
        invoice_id: inv.id,
        invoice_number: inv.number,
        payment_method_selection: 'card',
        base_amount_cents: String(inv.total_cents),
        processing_fee_cents: String(feeCents),
        charge_total_cents: String(chargeCents),
      },
      payment_intent_data: {
        metadata: {
          source: 'invoice_payment',
          invoice_id: inv.id,
          invoice_number: inv.number,
          payment_method_selection: 'card',
          base_amount_cents: String(inv.total_cents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(chargeCents),
        },
      },
    });

    await sql`
      UPDATE invoices
      SET stripe_payment_link_url = ${session.url}, stripe_checkout_session_id = ${session.id}, updated_at = NOW()
      WHERE id = ${inv.id}
    `;

    let emailStatus: 'sent' | 'skipped' | 'failed' | 'no_advertiser' | 'no_email' = 'skipped';
    let consumeUrl: string | null = null;
    if (sendEmail && inv.advertiser_id) {
      const sendTo = typeof body.email_to === 'string' && body.email_to.trim()
        ? body.email_to.trim()
        : inv.bill_to_email;
      if (!sendTo) {
        emailStatus = 'no_email';
      } else {
        const raw = generateMagicLinkToken();
        const tokenHash = hashMagicLinkToken(raw);
        const linkExpires = new Date(Date.now() + PORTAL_LINK_TTL_MS).toISOString();
        await sql`
          INSERT INTO portal_magic_links (advertiser_id, token_hash, purpose, link_expires_at, sent_to_email, created_by, entity_id)
          VALUES (${inv.advertiser_id}, ${tokenHash}, 'pay_invoice', ${linkExpires}, ${sendTo}, ${admin.email ?? null}, ${inv.id})
        `;
        consumeUrl = `${APP_BASE_URL}/portal/consume?token=${encodeURIComponent(raw)}`;

        if (process.env.RESEND_API_KEY) {
          try {
            const resend = new Resend(process.env.RESEND_API_KEY);
            const subject = typeof body.email_subject === 'string' && body.email_subject.trim()
              ? body.email_subject.trim()
              : emailMode === 'reminder'
                ? `Reminder: Invoice ${inv.number} from Caxton Publications is due`
                : `Invoice ${inv.number} from Caxton Publications`;
            const customMessage = typeof body.email_message === 'string' ? body.email_message.trim() : '';
            const requestedSender = typeof body.email_from === 'string' ? body.email_from.trim() : '';
            const sender: InvoiceSender = requestedSender in INVOICE_SENDERS
              ? requestedSender as InvoiceSender
              : emailMode === 'reminder'
                ? 'tawanna@myrealtyline.com'
                : 'hello@myrealtyline.com';
            await resend.emails.send({
              from: INVOICE_SENDERS[sender],
              replyTo: sender,
              to: sendTo,
              subject,
              html: invoiceEmailHtml({
                name: inv.bill_to_name ?? 'there',
                number: inv.number,
                consumeUrl,
                amountCents: inv.total_cents,
                customMessage,
                reminder: emailMode === 'reminder',
              }),
              text: invoiceEmailText({
                name: inv.bill_to_name ?? 'there',
                number: inv.number,
                consumeUrl,
                amountCents: inv.total_cents,
                customMessage,
                reminder: emailMode === 'reminder',
              }),
            });
            emailStatus = 'sent';
            if (emailMode === 'reminder') {
              await sql`
                UPDATE invoices
                SET last_reminder_sent_at = NOW(),
                    reminder_count = COALESCE(reminder_count, 0) + 1,
                    updated_at = NOW()
                WHERE id = ${inv.id}
              `;
            }
          } catch (err) {
            emailStatus = 'failed';
            console.error('invoice payment-link email failed', err);
          }
        }
      }
    } else if (sendEmail && !inv.advertiser_id) {
      emailStatus = 'no_advertiser';
    }

    revalidateInvoiceViews(inv.id);
    return NextResponse.json({
      ok: true,
      checkout_url: session.url,
      portal_pay_url: consumeUrl,
      email_status: emailStatus,
    });
  } catch (err) {
    console.error('[admin/invoices payment-link]', err);
    return NextResponse.json(
      { error: 'payment link failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});

function invoiceEmailText({
  name,
  number,
  consumeUrl,
  amountCents,
  customMessage,
  reminder,
}: {
  name: string;
  number: string;
  consumeUrl: string;
  amountCents: number;
  customMessage: string;
  reminder: boolean;
}): string {
  if (customMessage) {
    return [
      customMessage,
      '',
      `Balance due: ${formatEmailCents(amountCents)}`,
      '',
      consumeUrl,
      '',
      'This link is valid for 24 hours and may only be used once.',
    ].join('\n');
  }

  return [
    `Dear ${name},`,
    '',
    reminder
      ? `This is a reminder that invoice ${number} has not been paid. If you have any questions, please reach out to our office.`
      : `We appreciate your business. Your invoice ${number} is ready to review and pay.`,
    '',
    `Balance due: ${formatEmailCents(amountCents)}`,
    '',
    consumeUrl,
    '',
    'This link is valid for 24 hours and may only be used once.',
    '',
    'Sincerely,',
    'Caxton Publications Inc.',
  ].join('\n');
}

function invoiceEmailHtml({
  name,
  number,
  consumeUrl,
  amountCents,
  customMessage,
  reminder,
}: {
  name: string;
  number: string;
  consumeUrl: string;
  amountCents: number;
  customMessage: string;
  reminder: boolean;
}): string {
  const message = customMessage || (reminder
    ? `This is a reminder that invoice ${number} has not been paid. If you have any questions, please reach out to our office.`
    : `We appreciate your business. Your invoice ${number} is ready to review and pay.`);
  const greeting = customMessage
    ? ''
    : `<p style="font-size:15px;line-height:1.6">Dear ${escapeEmailHtml(name)},</p>`;
  const closing = customMessage
    ? ''
    : '<p style="font-size:14px;line-height:1.6">Sincerely,<br><strong>Caxton Publications Inc.</strong></p>';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#202124;background:#fff">
    <div style="text-align:center;padding:12px 0 24px">
      <img src="${APP_BASE_URL}/brand/caxton-logo.jpg" width="125" alt="Caxton Publications Inc." style="display:inline-block;max-height:105px;object-fit:contain">
    </div>
    <div style="background:#eef6fb;padding:28px;text-align:center">
      <h2 style="font-size:24px;margin:0 0 18px">${reminder ? 'Payment reminder' : 'Your invoice is ready!'}</h2>
      <div style="font-size:11px;color:#667085;text-transform:uppercase;letter-spacing:.08em">Balance due</div>
      <div style="font-size:38px;font-weight:600;margin-top:4px">${formatEmailCents(amountCents)}</div>
    </div>
    <div style="padding:28px 12px">
      ${greeting}
      <p style="font-size:15px;line-height:1.6;white-space:pre-line">${escapeEmailHtml(message)}</p>
      <p style="margin:26px 0;text-align:center">
      <a href="${consumeUrl}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600">
        View &amp; pay invoice ${escapeEmailHtml(number)}
      </a>
      </p>
      <p style="font-size:13px;color:#667085">This secure link is valid for 24 hours and may only be used once.</p>
      ${closing}
    </div>
  </div>`;
}

function formatEmailCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeEmailHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
