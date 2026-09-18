// lib/server/invoice-payment-link.ts
//
// Shared "create/refresh a Stripe Checkout Session for an invoice" logic,
// extracted from app/api/admin/invoices/[id]/payment-link/route.ts so the
// admin-triggered POST route and the automatic refresh cron
// (app/api/cron/refresh-payment-links/route.ts) share one implementation
// instead of drifting apart.
//
// Stripe Checkout Sessions expire ~24h after creation by default (we don't
// pass expires_at, so the default applies). Nothing in this app polled for
// that, so a link handed out on day N silently died by day N+1 while the
// UI kept showing it as live — see the refresh cron for the fix.

import { getSql, ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { paymentMethodLabel, processingFeeCents } from '@/lib/payment-processing-fees';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { resolveEmailSenderAddress } from '@/lib/email-sender';
import { ensurePublicationColumn } from '@/lib/publication-theme';
import {
  APP_BASE_URL,
  sendInvoiceEmail,
  type InvoiceEmailStatus,
} from '@/lib/server/invoice-email';
import {
  InvoiceLifecycleError,
  invalidateInvoiceCheckoutSessions,
  lockInvoiceRemainingBalance,
  markCheckoutSessionFailed,
  markCheckoutSessionOpen,
  registerInvoiceCheckoutSession,
} from '@/lib/server/invoice-lifecycle';

interface InvoiceRow {
  id: string;
  number: string;
  advertiser_id: number | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  memo: string | null;
  due_date: string | null;
  balance_cents: number;
  /** advertisers.publication for advertiser_id — routes the email From address. */
  advertiser_publication: string | null;
}

export interface CreateInvoiceCheckoutSessionParams {
  invoiceId: string;
  createdBy: string | null;
  sendEmail: boolean;
  emailMode?: 'invoice' | 'reminder';
  emailFrom?: string;
  emailTo?: string;
  emailSubject?: string;
  emailMessage?: string;
}

export interface CreateInvoiceCheckoutSessionResult {
  ok: true;
  checkoutUrl: string | null;
  portalPayUrl: string | null;
  emailStatus: InvoiceEmailStatus;
  emailError: string | null;
  emailMessageId: string | null;
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

/**
 * Create (or replace) the live Stripe Checkout Session for an invoice.
 * Invalidates any prior open/creating session first, so at most one
 * live link exists per invoice. Optionally emails the advertiser —
 * callers doing a silent background refresh should pass sendEmail: false.
 *
 * Throws InvoiceLifecycleError (404 invoice not found, 409 concurrent
 * session creation) or the raw Stripe error on API failure.
 */
export async function createInvoiceCheckoutSession(
  params: CreateInvoiceCheckoutSessionParams,
): Promise<CreateInvoiceCheckoutSessionResult> {
  if (!isStripeConfigured()) {
    throw new InvoiceLifecycleError('Stripe is not configured', 400);
  }

  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  const requestedSender = params.emailFrom?.trim() ?? '';
  const resolvedSender = resolveEmailSenderAddress(requestedSender);
  if (params.sendEmail && requestedSender && !resolvedSender) {
    throw new InvoiceLifecycleError(
      'The selected From address is not verified for email delivery.',
      400,
    );
  }

  let registryId: string | null = null;
  const inv = await withNeonTransaction(async (client): Promise<InvoiceRow> => {
    const { remainingCents } = await lockInvoiceRemainingBalance(client, params.invoiceId);
    const invoiceResult = await client.query<Omit<InvoiceRow, 'balance_cents'>>(
      `SELECT i.id, i.number, i.advertiser_id, i.bill_to_name, i.bill_to_email,
              i.memo, i.due_date,
              (SELECT a.publication FROM advertisers a WHERE a.id = i.advertiser_id)
                AS advertiser_publication
         FROM invoices i
        WHERE i.id = $1`,
      [params.invoiceId],
    );
    const invoice = invoiceResult.rows[0];
    if (!invoice) throw new InvoiceLifecycleError('invoice not found', 404);

    await invalidateInvoiceCheckoutSessions(client, params.invoiceId);
    let registered;
    try {
      registered = await registerInvoiceCheckoutSession(client, {
        invoiceId: params.invoiceId,
        baseAmountCents: remainingCents,
        createdBy: params.createdBy ?? 'admin',
      });
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw new InvoiceLifecycleError('another checkout session is already being created', 409);
      }
      throw err;
    }
    registryId = registered.id;
    return { ...invoice, balance_cents: remainingCents };
  });

  const stripe = getStripe();
  const feeCents = processingFeeCents(inv.balance_cents, 'card');
  const chargeCents = inv.balance_cents + feeCents;
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: inv.bill_to_email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: inv.balance_cents,
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
        base_amount_cents: String(inv.balance_cents),
        processing_fee_cents: String(feeCents),
        charge_total_cents: String(chargeCents),
      },
      payment_intent_data: {
        metadata: {
          source: 'invoice_payment',
          invoice_id: inv.id,
          invoice_number: inv.number,
          payment_method_selection: 'card',
          base_amount_cents: String(inv.balance_cents),
          processing_fee_cents: String(feeCents),
          charge_total_cents: String(chargeCents),
        },
      },
    });
  } catch (stripeErr) {
    if (registryId) {
      await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
    }
    throw stripeErr;
  }

  try {
    await withNeonTransaction(async (client) => {
      await markCheckoutSessionOpen(client, registryId as string, {
        id: session.id,
        url: session.url,
      });
      await client.query(
        `UPDATE invoices
            SET stripe_payment_link_url = $2,
                stripe_checkout_session_id = $3,
                updated_at = NOW()
          WHERE id = $1`,
        [inv.id, session.url, session.id],
      );
    });
  } catch (finalizeErr) {
    try { await stripe.checkout.sessions.expire(session.id); } catch { /* best effort */ }
    await withNeonTransaction((client) => markCheckoutSessionFailed(client, registryId as string));
    if (isPostgresUniqueViolation(finalizeErr)) {
      throw new InvoiceLifecycleError('another checkout session replaced this request', 409);
    }
    throw finalizeErr;
  }

  // The email send (magic link + Resend) deliberately runs after every
  // transaction above has committed: a network send must never sit inside a
  // DB transaction that could roll back.
  let emailStatus: InvoiceEmailStatus = 'skipped';
  let emailError: string | null = null;
  let emailMessageId: string | null = null;
  let consumeUrl: string | null = null;
  if (params.sendEmail) {
    const outcome = await sendInvoiceEmail({
      sql,
      invoiceId: inv.id,
      invoiceNumber: inv.number,
      advertiserId: inv.advertiser_id,
      billToName: inv.bill_to_name,
      billToEmail: params.emailTo?.trim() ? params.emailTo.trim() : inv.bill_to_email,
      balanceCents: inv.balance_cents,
      publication: inv.advertiser_publication,
      sender: resolvedSender ?? undefined,
      subject: params.emailSubject,
      customMessage: params.emailMessage,
      reminder: params.emailMode === 'reminder',
      createdBy: params.createdBy,
    });
    emailStatus = outcome.status;
    emailError = outcome.error ?? null;
    emailMessageId = outcome.messageId ?? null;
    consumeUrl = outcome.consumeUrl ?? null;
  }

  revalidateInvoiceViews(inv.id);
  return {
    ok: true,
    checkoutUrl: session.url,
    portalPayUrl: consumeUrl,
    emailStatus,
    emailError,
    emailMessageId,
  };
}
