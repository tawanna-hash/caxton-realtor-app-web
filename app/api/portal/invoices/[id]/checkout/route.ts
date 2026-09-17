// app/api/portal/invoices/[id]/checkout/route.ts
//
// POST — advertiser (portal session) or staff (admin session) creates a
// Stripe Checkout Session for an invoice. Used by:
//   - the embedded/hosted pay page at /portal/invoices/[id]
//   - the admin "Get payment link" action (ui_mode='hosted')
//
// Body: { ui_mode?: 'hosted' | 'embedded', payment_method?: 'card' | 'ach' | 'bnpl' }
// Returns: { url } for hosted, { client_secret } for embedded.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import {
  isInvoicePaymentMethod,
  paymentMethodLabel,
  processingFeeCents,
  type InvoicePaymentMethod,
} from '@/lib/payment-processing-fees';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  InvoiceLifecycleError,
  invalidateInvoiceCheckoutSessions,
  lockInvoiceRemainingBalance,
  markCheckoutSessionFailed,
  markCheckoutSessionOpen,
  registerInvoiceCheckoutSession,
} from '@/lib/server/invoice-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.myrealtyline.com';

interface InvoiceRow {
  id: string;
  advertiser_id: number | null;
  number: string;
  status: string;
  total_cents: number;
  bill_to_name: string | null;
  bill_to_email: string | null;
  stripe_customer_id: string | null;
  memo: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Payments are not configured yet.' }, { status: 503 });
  }

  // Auth: either a portal session scoped to this invoice's advertiser, or an admin.
  const [portalUser, admin] = await Promise.all([getCurrentPortalUser(), getCurrentAdmin()]);
  if (!portalUser && !admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const uiMode = body.ui_mode === 'embedded' ? 'embedded' : 'hosted';
  const paymentMethod: InvoicePaymentMethod = isInvoicePaymentMethod(body.payment_method)
    ? body.payment_method
    : 'card';

  let registryId: string | null = null;

  try {
    await ensureSchema();

    // Lock the invoice, compute the REMAINING balance (not total_cents —
    // finding API-#1), expire any prior live session for this invoice, and
    // register the new one — all inside one transaction and before we ever
    // call Stripe. A concurrent request blocks on the row lock instead of
    // creating a second live, untracked session (finding API-#2).
    const { inv, chargeAmountCents } = await withNeonTransaction(async (client) => {
      const invoiceResult = await client.query<InvoiceRow>(
        `SELECT id, advertiser_id, number, status, total_cents,
                bill_to_name, bill_to_email, stripe_customer_id, memo
           FROM invoices WHERE id = $1`,
        [id],
      );
      const invoiceRow = invoiceResult.rows[0];
      if (!invoiceRow) throw new InvoiceLifecycleError('Invoice not found', 404);
      if (portalUser && invoiceRow.advertiser_id !== portalUser.advertiser_id) {
        // Same 404 as "not found" — never confirm existence of another
        // advertiser's invoice to an unauthorized portal session.
        throw new InvoiceLifecycleError('Invoice not found', 404);
      }

      const { remainingCents } = await lockInvoiceRemainingBalance(client, id);
      await invalidateInvoiceCheckoutSessions(client, id);
      const registered = await registerInvoiceCheckoutSession(client, {
        invoiceId: id,
        baseAmountCents: remainingCents,
        createdBy: admin?.email ?? (portalUser ? 'portal' : null),
      });
      registryId = registered.id;
      return { inv: { ...invoiceRow, total_cents: remainingCents }, chargeAmountCents: remainingCents };
    });

    const stripe = getStripe();
    const feeCents = processingFeeCents(chargeAmountCents, paymentMethod);
    const chargeCents = chargeAmountCents + feeCents;
    const successUrl = `${APP_BASE_URL}/portal/invoices/${inv.id}?paid=1`;
    const cancelUrl = `${APP_BASE_URL}/portal/invoices/${inv.id}?canceled=1`;
    const stripePaymentMethodTypes = paymentMethod === 'ach'
      ? ['us_bank_account']
      : paymentMethod === 'bnpl'
        ? ['affirm', 'afterpay_clearpay', 'klarna']
        : ['card'];

    const sessionParams: Record<string, unknown> = {
      mode: 'payment' as const,
      payment_method_types: stripePaymentMethodTypes,
      customer: inv.stripe_customer_id ?? undefined,
      customer_email: inv.stripe_customer_id ? undefined : (inv.bill_to_email ?? undefined),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: chargeAmountCents,
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
              name: `${paymentMethodLabel(paymentMethod)} processing fee`,
              description: 'Processing fee disclosed before payment authorization',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        source: 'invoice_payment',
        invoice_id: inv.id,
        invoice_number: inv.number,
        payment_method_selection: paymentMethod,
        base_amount_cents: String(chargeAmountCents),
        processing_fee_cents: String(feeCents),
        charge_total_cents: String(chargeCents),
      },
      payment_intent_data: {
        metadata: {
          source: 'invoice_payment',
          invoice_id: inv.id,
          invoice_number: inv.number,
          payment_method_selection: paymentMethod,
          base_amount_cents: String(chargeAmountCents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(chargeCents),
        },
      },
    };

    if (uiMode === 'embedded') {
      sessionParams.ui_mode = 'embedded';
      sessionParams.return_url = `${APP_BASE_URL}/portal/invoices/${inv.id}?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = successUrl;
      sessionParams.cancel_url = cancelUrl;
    }

    let session;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session = await stripe.checkout.sessions.create(sessionParams as any);
    } catch (stripeErr) {
      if (registryId) {
        await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
      }
      throw stripeErr;
    }

    await withNeonTransaction(async (client) => {
      await markCheckoutSessionOpen(client, registryId as string, { id: session!.id, url: session!.url ?? null });
      await client.query(
        `UPDATE invoices SET stripe_checkout_session_id = $2 WHERE id = $1`,
        [inv.id, session!.id],
      );
    });

    if (uiMode === 'embedded') {
      return NextResponse.json({
        client_secret: session.client_secret,
        processing_fee_cents: feeCents,
        total_cents: chargeCents,
      });
    }
    return NextResponse.json({
      url: session.url,
      processing_fee_cents: feeCents,
      total_cents: chargeCents,
    });
  } catch (err) {
    if (err instanceof InvoiceLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('invoice checkout failed', err);
    return NextResponse.json(
      { error: 'checkout failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}
