// app/api/admin/invoices/[id]/payment-link/route.ts
//
// POST — staff generates (or refreshes) a hosted Stripe Checkout link for
// an invoice and stores it on invoices.stripe_payment_link_url. Optionally
// emails a `pay_invoice` portal magic link to the advertiser in the same
// call (send_email: true, default true) so they land straight on the
// embedded pay page rather than the raw Stripe URL.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { isStripeConfigured, getStripe } from '@/lib/stripe';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import { resolveEmailSenderAddress } from '@/lib/email-sender';
import { createInvoiceCheckoutSession } from '@/lib/server/invoice-payment-link';
import {
  InvoiceLifecycleError,
  invalidateInvoiceCheckoutSessions,
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
    const result = await createInvoiceCheckoutSession({
      invoiceId: id,
      createdBy: admin.email ?? admin.adminId ?? 'admin',
      sendEmail,
      emailMode,
      emailFrom: requestedSender || undefined,
      emailTo: typeof body.email_to === 'string' ? body.email_to : undefined,
      emailSubject: typeof body.email_subject === 'string' ? body.email_subject : undefined,
      emailMessage: typeof body.email_message === 'string' ? body.email_message : undefined,
    });

    return NextResponse.json({
      ok: true,
      checkout_url: result.checkoutUrl,
      portal_pay_url: result.portalPayUrl,
      email_status: result.emailStatus,
      email_error: result.emailError,
      email_message_id: result.emailMessageId,
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

