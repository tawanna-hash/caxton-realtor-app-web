// app/api/admin/invoices/[id]/payment-link/route.ts
//
// POST — staff generates (or refreshes) a hosted Stripe Checkout link for
// an invoice and stores it on invoices.stripe_payment_link_url. Optionally
// emails a `pay_invoice` portal magic link to the advertiser in the same
// call (send_email: true, default true) so they land straight on the
// embedded pay page rather than the raw Stripe URL.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { paymentMethodLabel, processingFeeCents } from '@/lib/payment-processing-fees';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class PaymentLinkRouteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PaymentLinkRouteError';
  }
}

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
  const requestedSender = typeof body.email_from === 'string' ? body.email_from.trim() : '';
  const resolvedSender = resolveEmailSenderAddress(requestedSender);
  if (sendEmail && requestedSender && !resolvedSender) {
    return NextResponse.json(
      { error: 'The selected From address is not verified for email delivery.' },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();
    // advertisers.publication is lazily migrated; ensure it before reading it.
    await ensurePublicationColumn();
    const sql = getSql();
    let registryId: string | null = null;
    const inv = await withNeonTransaction(async (client): Promise<InvoiceRow> => {
      const { remainingCents } = await lockInvoiceRemainingBalance(client, id);
      const invoiceResult = await client.query<Omit<InvoiceRow, 'balance_cents'>>(
        `SELECT i.id, i.number, i.advertiser_id, i.bill_to_name, i.bill_to_email,
                i.memo, i.due_date,
                (SELECT a.publication FROM advertisers a WHERE a.id = i.advertiser_id)
                  AS advertiser_publication
           FROM invoices i
          WHERE i.id = $1`,
        [id],
      );
      const invoice = invoiceResult.rows[0];
      if (!invoice) throw new InvoiceLifecycleError('invoice not found', 404);

      await invalidateInvoiceCheckoutSessions(client, id);
      let registered;
      try {
        registered = await registerInvoiceCheckoutSession(client, {
          invoiceId: id,
          baseAmountCents: remainingCents,
          createdBy: admin.adminId ?? 'admin',
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
    if (sendEmail) {
      const outcome = await sendInvoiceEmail({
        sql,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        advertiserId: inv.advertiser_id,
        billToName: inv.bill_to_name,
        billToEmail: typeof body.email_to === 'string' && body.email_to.trim()
          ? body.email_to.trim()
          : inv.bill_to_email,
        balanceCents: inv.balance_cents,
        // Explicit admin-selected From wins; otherwise route by publication.
        publication: inv.advertiser_publication,
        sender: resolvedSender ?? undefined,
        subject: typeof body.email_subject === 'string' ? body.email_subject : undefined,
        customMessage: typeof body.email_message === 'string' ? body.email_message : undefined,
        reminder: emailMode === 'reminder',
        createdBy: admin.email ?? null,
      });
      emailStatus = outcome.status;
      emailError = outcome.error ?? null;
      emailMessageId = outcome.messageId ?? null;
      consumeUrl = outcome.consumeUrl ?? null;
    }

    revalidateInvoiceViews(inv.id);
    return NextResponse.json({
      ok: true,
      checkout_url: session.url,
      portal_pay_url: consumeUrl,
      email_status: emailStatus,
      email_error: emailError,
      email_message_id: emailMessageId,
    });
  } catch (err) {
    if (err instanceof InvoiceLifecycleError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/invoices payment-link]', err);
    return NextResponse.json(
      { error: 'payment link failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});

export const DELETE = withAdminTracking(async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    await withNeonTransaction(async (client) => {
      const invoiceResult = await client.query<{ id: string; stripe_checkout_session_id: string | null }>(
        `SELECT id, stripe_checkout_session_id
           FROM invoices
          WHERE id = $1
          FOR UPDATE`,
        [id],
      );
      const inv = invoiceResult.rows[0];
      if (!inv) throw new InvoiceLifecycleError('invoice not found', 404);

      await invalidateInvoiceCheckoutSessions(client, id);
      const activeRegistryRows = await client.query<{ id: string }>(
        `SELECT id
           FROM invoice_checkout_sessions
          WHERE invoice_id = $1
            AND status IN ('creating', 'open')
          LIMIT 1`,
        [id],
      );
      if (activeRegistryRows.rows.length > 0) {
        throw new PaymentLinkRouteError(
          'Stripe could not confirm that the payment link was revoked. Try again.',
          502,
        );
      }

      // Support links created before the checkout-session registry existed.
      // Never clear the only local session ID unless Stripe confirms it is
      // expired or complete.
      if (inv.stripe_checkout_session_id && isStripeConfigured()) {
        await expireStripeSessionOrThrow(inv.stripe_checkout_session_id);
      }

      await client.query(
        `UPDATE invoices
            SET stripe_payment_link_url = NULL,
                stripe_checkout_session_id = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [inv.id],
      );
    });
    revalidateInvoiceViews(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof InvoiceLifecycleError || err instanceof PaymentLinkRouteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/invoices payment-link DELETE]', err);
    return NextResponse.json(
      { error: 'delete failed', detail: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
});

async function expireStripeSessionOrThrow(sessionId: string): Promise<void> {
  const stripe = getStripe();
  try {
    const expired = await stripe.checkout.sessions.expire(sessionId);
    if (expired.status === 'expired' || expired.status === 'complete') return;
  } catch {
    // Expiration rejects already-terminal sessions, while transient failures
    // need a follow-up read before local state can be cleared.
  }

  try {
    const current = await stripe.checkout.sessions.retrieve(sessionId);
    if (current.status === 'expired' || current.status === 'complete') return;
  } catch {
    // A failed verification is ambiguous, so retain the local session ID.
  }
  throw new PaymentLinkRouteError(
    'Stripe could not confirm that the payment link was revoked. Try again.',
    502,
  );
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}
