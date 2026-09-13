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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';
const PORTAL_FROM_EMAIL = process.env.PORTAL_FROM_EMAIL ?? 'no-reply@myrealtyline.com';

interface InvoiceRow {
  id: string;
  number: string;
  status: string;
  total_cents: number;
  advertiser_id: number | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  memo: string | null;
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

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, number, status, total_cents, advertiser_id, bill_to_name, bill_to_email, memo
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
      const sendTo = inv.bill_to_email;
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
            await resend.emails.send({
              from: PORTAL_FROM_EMAIL,
              to: sendTo,
              subject: `Invoice ${inv.number} from RealtyLine`,
              html: invoiceEmailHtml({ name: inv.bill_to_name ?? 'there', number: inv.number, consumeUrl }),
              text: invoiceEmailText({ name: inv.bill_to_name ?? 'there', number: inv.number, consumeUrl }),
            });
            emailStatus = 'sent';
          } catch (err) {
            emailStatus = 'failed';
            console.error('invoice payment-link email failed', err);
          }
        }
      }
    } else if (sendEmail && !inv.advertiser_id) {
      emailStatus = 'no_advertiser';
    }

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

function invoiceEmailText({ name, number, consumeUrl }: { name: string; number: string; consumeUrl: string }): string {
  return [
    `Hi ${name},`,
    '',
    `Your RealtyLine invoice ${number} is ready. View and pay it securely here:`,
    '',
    consumeUrl,
    '',
    'This link is valid for 24 hours and may only be used once.',
    '',
    '— RealtyLine',
  ].join('\n');
}

function invoiceEmailHtml({ name, number, consumeUrl }: { name: string; number: string; consumeUrl: string }): string {
  return `
  <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:32px;color:#111">
    <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px">Invoice ${number}</h2>
    <p style="font-family:system-ui,sans-serif;color:#444;font-size:15px;line-height:1.5">Hi ${name},</p>
    <p style="font-family:system-ui,sans-serif;color:#444;font-size:15px;line-height:1.5">
      Your RealtyLine invoice is ready. Use the secure link below to view the details and pay online.
      The link is valid for 24 hours and may only be used once.
    </p>
    <p style="margin:24px 0">
      <a href="${consumeUrl}" style="display:inline-block;background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif;font-weight:500">
        View &amp; pay invoice
      </a>
    </p>
    <p style="font-family:system-ui,sans-serif;color:#888;font-size:13px">If you didn't expect this email, please ignore it.</p>
  </div>`;
}
