// app/api/stripe/webhook/route.ts
//
// Stripe webhook endpoint. Verifies signature, processes payment events,
// marks the agreement paid.
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL:    https://realtynewsnow.app/api/stripe/webhook
//   Events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded,
//           checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted
// Then set STRIPE_WEBHOOK_SECRET in Vercel env to the whsec_... value Stripe gives.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured, getWebhookSecret } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import {
  expireOpenStatementPaymentSessionsForInvoice,
  reconcileStripeRefundInGetPaid,
  reconcileStripeStatementRefund,
  syncAgreementPaymentToGetPaid,
  upsertStripeInvoicePayment,
  upsertStripeStatementPayments,
} from '@/lib/server/stripe-payment-ledger-sync';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';
import {
  syncStripePlatinumBySubscription,
  syncStripePlatinumSubscription,
} from '@/lib/server/platinum-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const secret = getWebhookSecret();
  if (!secret) {
    return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not configured' }, { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'missing signature' }, { status: 400 });

  const stripe = getStripe();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    console.error('[stripe-webhook] signature verification failed:', msg);
    return NextResponse.json({ error: 'invalid signature', detail: msg }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    // F-edge: idempotency guard. Stripe retries 5xx for up to 3 days, so the
    // same event.id can hit us repeatedly. Bail early if we've already
    // processed this event. Race-safe: the INSERT is the leader-election.
    try {
      const insertResult = (await sql`
        INSERT INTO stripe_webhook_events (event_id, event_type)
        VALUES (${event.id}, ${event.type})
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `) as unknown as { event_id: string }[];
      if (insertResult.length === 0) {
        // Already processed (or another concurrent invocation got there first).
        console.log('[stripe-webhook] duplicate event ignored:', event.id);
        return NextResponse.json({ received: true, deduped: true });
      }
    } catch (err) {
      // Table missing in some preview env? Log and fall through — better to
      // double-process (idempotent UPDATEs) than to drop a real payment event.
      console.warn('[stripe-webhook] dedupe insert failed; proceeding:',
        err instanceof Error ? err.message : 'unknown');
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentSucceeded(sql, pi);
        break;
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentFailed(sql, pi);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleRefund(sql, charge);
        break;
      }
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.source === 'rnn_platinum' && session.metadata.realtor_id) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
          if (subscriptionId) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            await syncStripePlatinumSubscription(session.metadata.realtor_id, subscription);
          }
        } else if (
          ['invoice_payment', 'statement_payment'].includes(session.metadata?.source ?? '') &&
          session.payment_status === 'paid'
        ) {
          const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
          if (paymentIntentId) {
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            await handlePaymentSucceeded(sql, paymentIntent);
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncStripePlatinumBySubscription(subscription);
        break;
      }
      default:
        // Ignore other events; respond 2xx so Stripe doesn't retry.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe-webhook] handler error:', msg);
    // The event row is a processing claim, not a success receipt. Releasing it
    // on failure lets Stripe's retry perform the work instead of being falsely
    // acknowledged as a duplicate.
    try {
      const sql = getSql();
      await sql`DELETE FROM stripe_webhook_events WHERE event_id = ${event.id}`;
    } catch (releaseError) {
      console.error(
        '[stripe-webhook] failed to release event claim:',
        releaseError instanceof Error ? releaseError.message : 'unknown',
      );
    }
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'handler failed', detail: msg }, { status: 500 });
  }
}

async function handlePaymentSucceeded(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  // Self-serve checkout branch — agreement is looked up by stripe_payment_intent_id
  // (set by /api/checkout/submit) and the campaign is flipped active.
  if (pi.metadata?.source === 'self_serve_checkout') {
    await handleSelfServePaymentSucceeded(sql, pi);
    return;
  }

  // Invoice payment branch — embedded/hosted Checkout created by
  // /api/portal/invoices/[id]/checkout, keyed by metadata.invoice_id.
  if (pi.metadata?.source === 'invoice_payment') {
    await handleInvoicePaymentSucceeded(sql, pi);
    return;
  }

  if (pi.metadata?.source === 'statement_payment') {
    await handleStatementPaymentSucceeded(sql, pi);
    return;
  }

  const agreementId = pi.metadata?.agreement_id;
  if (!agreementId) {
    console.warn('[stripe-webhook] payment_intent.succeeded missing agreement_id metadata; pi:', pi.id);
    return;
  }

  const rows = (await sql`SELECT * FROM agreements WHERE id = ${agreementId}`) as unknown as Agreement[];
  if (rows.length === 0) {
    console.warn('[stripe-webhook] agreement not found for pi:', pi.id, 'aid:', agreementId);
    return;
  }
  const ag = rows[0];

  const paymentMethodId =
    typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id ?? null;

  // Fetch the PaymentMethod to backfill human-readable card details (brand,
  // last4, exp, cardholder name + billing address) used in the PDF and admin
  // UI. The wizard no longer collects these as “reference” fields — Stripe is
  // the source of truth.
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardExp: string | null = null;
  let cardholderName: string | null = null;
  let cardholderAddress: string | null = null;
  if (paymentMethodId) {
    try {
      const stripe = getStripe();
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (pm.card) {
        const brand = pm.card.brand; // 'visa' | 'mastercard' | 'amex' | ...
        cardBrand =
          brand === 'visa' ? 'Visa'
          : brand === 'mastercard' ? 'Mastercard'
          : brand === 'amex' ? 'American Express'
          : brand ? brand.charAt(0).toUpperCase() + brand.slice(1)
          : null;
        cardLast4 = pm.card.last4 ?? null;
        if (pm.card.exp_month && pm.card.exp_year) {
          const mm = String(pm.card.exp_month).padStart(2, '0');
          const yy = String(pm.card.exp_year).slice(-2);
          cardExp = `${mm}/${yy}`;
        }
      }
      if (pm.billing_details) {
        cardholderName = pm.billing_details.name ?? null;
        const a = pm.billing_details.address;
        if (a) {
          cardholderAddress = [a.line1, a.line2, a.city, a.state, a.postal_code]
            .filter(Boolean)
            .join(', ') || null;
        }
      }
    } catch (e) {
      console.warn('[stripe-webhook] PaymentMethod fetch failed for', paymentMethodId, e);
    }
  }

  // Always converge the Stripe/card snapshot. Only paid_at and the audit entry
  // are first-delivery facts; later issue charges may use a newer saved card.
  await sql`
    UPDATE agreements SET
      paid_at = COALESCE(paid_at, NOW()),
      stripe_charged_cents = ${pi.amount_received},
      stripe_charged_at = NOW(),
      stripe_payment_method_id = ${paymentMethodId},
      stripe_customer_id = ${typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? ag.stripe_customer_id)},
      payment_mode = COALESCE(payment_mode, 'card'),
      card_type = COALESCE(${cardBrand}, card_type),
      card_number_last4 = COALESCE(${cardLast4}, card_number_last4),
      card_expiration = COALESCE(${cardExp}, card_expiration),
      cardholder_name = COALESCE(${cardholderName}, cardholder_name),
      cardholder_address = COALESCE(${cardholderAddress}, cardholder_address),
      updated_at = NOW()
    WHERE id = ${ag.id}
  `;
  if (pi.metadata?.issue_charge_id) {
    await sql`
      UPDATE issue_charges SET
        status = 'succeeded',
        stripe_payment_intent_id = ${pi.id},
        stripe_charge_id = ${typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null},
        failure_reason = NULL,
        charged_at = NOW(),
        updated_at = NOW()
      WHERE id = ${pi.metadata.issue_charge_id}
    `;
  }

  // Append the 'stripe_payment_succeeded' audit entry only on the first
  // successful delivery. Subsequent Stripe webhook retries skip it so the PDF
  // audit trail doesn't grow duplicate rows.
  if (!ag.paid_at) {
    const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
      audit_log: AgreementAuditEntry[] | null;
    }>;
    const newLog = appendAudit(auditRows[0]?.audit_log, {
      event: 'stripe_payment_succeeded',
      timestamp: new Date().toISOString(),
      details: `Stripe charged ${(pi.amount_received / 100).toFixed(2)} ${pi.currency.toUpperCase()} \u2014 pi: ${pi.id}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;
  }

  const updatedRows = (await sql`
    SELECT * FROM agreements WHERE id = ${ag.id}
  `) as unknown as Agreement[];
  const updatedAgreement = updatedRows[0];
  if (updatedAgreement) {
    await syncAgreementToAdvertiser(updatedAgreement);
    const invoiceId = await syncAgreementPaymentToGetPaid(sql, updatedAgreement, pi);
    if (!invoiceId) {
      console.warn(
        '[stripe-webhook] skipped Get Paid representation; agreement lacks Partner or base amount:',
        ag.id,
      );
    }
  }
}

async function handleSelfServePaymentSucceeded(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  // The /api/checkout/submit endpoint writes the agreement row keyed by
  // stripe_payment_intent_id. Stripe at-least-once delivery means we may get
  // this event before submit() finishes — in that case there's no row yet;
  // we return non-200 so Stripe retries on its backoff schedule (up to 3 days).
  const rows = (await sql`
    SELECT id, status, paid_at FROM agreements WHERE stripe_payment_intent_id = ${pi.id} LIMIT 1
  `) as unknown as Array<{ id: string; status: string; paid_at: string | null }>;

  if (rows.length === 0) {
    console.warn('[stripe-webhook] self-serve agreement not yet persisted, will retry. pi:', pi.id);
    throw new Error('self-serve agreement not yet persisted; Stripe will retry');
  }

  const ag = rows[0];
  const firstSuccessfulDelivery = !ag.paid_at;

  const paymentMethodId =
    typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id ?? null;
  const customerId =
    typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null;

  // Backfill card details from PaymentMethod
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardExp: string | null = null;
  if (paymentMethodId) {
    try {
      const stripe = getStripe();
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      if (pm.card) {
        const b = pm.card.brand;
        cardBrand =
          b === 'visa' ? 'Visa'
          : b === 'mastercard' ? 'Mastercard'
          : b === 'amex' ? 'American Express'
          : b ? b.charAt(0).toUpperCase() + b.slice(1)
          : null;
        cardLast4 = pm.card.last4 ?? null;
        if (pm.card.exp_month && pm.card.exp_year) {
          cardExp = `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`;
        }
      }
    } catch (e) {
      console.warn('[stripe-webhook] self-serve PM fetch failed:', e);
    }
  }

  // 1) Mark agreement paid + signed. NOTE: status is 'signed', NOT 'active' —
  //    payment does not make the placement live. An admin must approve the
  //    creative from /admin/ads/orders before it goes live. paid_at makes the
  //    orders pipeline render this as "paid".
  await sql`
    UPDATE agreements SET
      status = CASE WHEN paid_at IS NULL THEN 'signed' ELSE status END,
      signed_at = COALESCE(signed_at, NOW()),
      sign_date = COALESCE(sign_date, NOW()::date::text),
      paid_at = COALESCE(paid_at, NOW()),
      stripe_charged_cents = ${pi.amount_received},
      stripe_charged_at = NOW(),
      stripe_payment_method_id = ${paymentMethodId},
      stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
      payment_mode = COALESCE(payment_mode, 'card'),
      card_type = COALESCE(${cardBrand}, card_type),
      card_number_last4 = COALESCE(${cardLast4}, card_number_last4),
      card_expiration = COALESCE(${cardExp}, card_expiration),
      updated_at = NOW()
    WHERE id = ${ag.id}
  `;

  // 2) Append audit
  if (firstSuccessfulDelivery) {
    const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
      audit_log: AgreementAuditEntry[] | null;
    }>;
    const newLog = appendAudit(auditRows[0]?.audit_log, {
      event: 'self_serve_payment_succeeded',
      timestamp: new Date().toISOString(),
      details: `Stripe charged ${(pi.amount_received / 100).toFixed(2)} ${pi.currency.toUpperCase()} \u2014 pi: ${pi.id}; awaiting admin approval before go-live.`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;
  }

  // 3) Move the campaign (matched by notes containing the pi.id, written by
  //    /api/checkout/submit) from 'draft' -> 'pending'. It stays active=false
  //    (not live) but now RESERVES capacity so the slot can't be oversold
  //    while it awaits admin approval at /admin/ads/orders. Guarded on the
  //    draft->pending transition so it's idempotent under Stripe retries and
  //    never overwrites an already-approved campaign.
  await sql`
    UPDATE ad_campaigns
       SET approval_status = 'pending', updated_at = NOW()
     WHERE notes LIKE ${'%' + pi.id + '%'}
       AND approval_status = 'draft'
  `;

  const updatedRows = (await sql`
    SELECT * FROM agreements WHERE id = ${ag.id}
  `) as unknown as Agreement[];
  if (updatedRows[0]) {
    await syncAgreementToAdvertiser(updatedRows[0]);
    const invoiceId = await syncAgreementPaymentToGetPaid(sql, updatedRows[0], pi);
    if (!invoiceId) {
      console.warn(
        '[stripe-webhook] skipped self-serve Get Paid representation; agreement lacks Partner or base amount:',
        ag.id,
      );
    }
  }

  console.log('[stripe-webhook] self-serve paid, pending approval \u2014 agreement', ag.id, 'pi:', pi.id);
}

async function handleInvoicePaymentSucceeded(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const invoiceId = pi.metadata?.invoice_id;
  if (!invoiceId) {
    console.warn('[stripe-webhook] invoice_payment succeeded missing invoice_id metadata; pi:', pi.id);
    return;
  }

  await upsertStripeInvoicePayment(sql, invoiceId, pi);
  await expireOpenStatementPaymentSessionsForInvoice(sql, invoiceId);
  console.log('[stripe-webhook] invoice payment ledger synchronized \u2014 invoice', invoiceId, 'pi:', pi.id);
}

async function handleStatementPaymentSucceeded(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const statementPaymentId = pi.metadata?.statement_payment_id;
  if (!statementPaymentId) {
    console.warn('[stripe-webhook] statement_payment succeeded missing statement_payment_id; pi:', pi.id);
    return;
  }
  const invoiceIds = await upsertStripeStatementPayments(sql, statementPaymentId, pi);
  console.log(
    '[stripe-webhook] statement payment allocated',
    invoiceIds.length,
    'invoices; statement:',
    statementPaymentId,
    'pi:',
    pi.id,
  );
}

async function handlePaymentFailed(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  if (pi.metadata?.source === 'invoice_payment') {
    // Nothing to roll back on the invoice row itself — it stays in its
    // current status (sent/overdue) so the advertiser can simply retry.
    console.warn('[stripe-webhook] invoice payment failed. invoice_id:', pi.metadata.invoice_id, 'pi:', pi.id);
    return;
  }
  if (pi.metadata?.source === 'statement_payment') {
    console.warn(
      '[stripe-webhook] statement payment failed. statement_payment_id:',
      pi.metadata.statement_payment_id,
      'pi:',
      pi.id,
    );
    return;
  }

  const agreementId = pi.metadata?.agreement_id;
  if (!agreementId) return;

  const reason = pi.last_payment_error?.message ?? 'unknown';
  if (pi.metadata?.issue_charge_id) {
    await sql`
      UPDATE issue_charges SET
        status = 'failed',
        stripe_payment_intent_id = ${pi.id},
        failure_reason = ${reason},
        updated_at = NOW()
      WHERE id = ${pi.metadata.issue_charge_id}
    `;
  }
  const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${agreementId}`) as unknown as Array<{
    audit_log: AgreementAuditEntry[] | null;
  }>;
  if (auditRows.length === 0) return;

  const newLog = appendAudit(auditRows[0]?.audit_log, {
    event: 'stripe_payment_failed',
    timestamp: new Date().toISOString(),
    details: `pi: ${pi.id} \u2014 ${reason}`,
  });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb, updated_at = NOW() WHERE id = ${agreementId}`;
}

async function handleRefund(sql: ReturnType<typeof getSql>, charge: Stripe.Charge): Promise<void> {
  // Self-serve release: a refunded self-serve booking must stop reserving
  // capacity and must not go live. Reset the linked campaign to a
  // non-reserving 'draft' + inactive so the slot frees up immediately.
  const piId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!piId) return;
  const pi = typeof charge.payment_intent === 'string'
    ? await getStripe().paymentIntents.retrieve(charge.payment_intent)
    : charge.payment_intent;
  if (!pi) return;
  if (piId) {
    await sql`
      UPDATE ad_campaigns
         SET active = false, approval_status = 'draft', updated_at = NOW()
       WHERE notes LIKE ${'%' + piId + '%'}
    `;
  }

  const chargeSource = pi.metadata?.source;
  const invoiceId =
    pi.metadata?.invoice_id ??
    (chargeSource === 'invoice_payment' ? charge.metadata?.invoice_id : null);
  const reconciledInvoiceIds = chargeSource === 'statement_payment' && pi.metadata?.statement_payment_id
    ? await reconcileStripeStatementRefund(sql, pi.metadata.statement_payment_id, pi, charge)
    : await reconcileStripeRefundInGetPaid(sql, pi, charge);
  if (invoiceId && !reconciledInvoiceIds.includes(invoiceId)) {
    // Repair older payments that predate the ledger: the invoice must not stay
    // paid merely because there was no invoice_payments row to reverse.
    await sql`
      UPDATE invoices SET
        status = CASE WHEN due_date < CURRENT_DATE THEN 'overdue' ELSE 'sent' END,
        paid_at = NULL,
        updated_at = NOW()
      WHERE id = ${invoiceId} AND status <> 'void'
    `;
    revalidateInvoiceViews(invoiceId);
  }

  const agreementId =
    pi.metadata?.agreement_id ?? charge.metadata?.agreement_id;
  if (!agreementId) {
    if (invoiceId) {
      console.log('[stripe-webhook] invoice refund reconciled \u2014 invoice', invoiceId, 'charge:', charge.id);
    }
    return;
  }

  const auditRows = (await sql`SELECT * FROM agreements WHERE id = ${agreementId}`) as unknown as Agreement[];
  if (auditRows.length === 0) return;

  const refundDetails = `charge: ${charge.id} \u2014 refunded ${(charge.amount_refunded / 100).toFixed(2)} ${charge.currency.toUpperCase()}`;
  const alreadyAudited = auditRows[0].audit_log?.some(
    (entry) => entry.event === 'stripe_refunded' && entry.details === refundDetails,
  );
  const newLog = alreadyAudited
    ? auditRows[0].audit_log
    : appendAudit(auditRows[0].audit_log, {
        event: 'stripe_refunded',
        timestamp: new Date().toISOString(),
        details: refundDetails,
      });
  const remainingChargedCents = Math.max(charge.amount - charge.amount_refunded, 0);
  if (pi.metadata?.issue_charge_id && charge.refunded) {
    await sql`
      UPDATE issue_charges SET
        status = 'refunded',
        stripe_payment_intent_id = ${pi.id},
        stripe_charge_id = ${charge.id},
        updated_at = NOW()
      WHERE id = ${pi.metadata.issue_charge_id}
    `;
  }
  await sql`
    UPDATE agreements SET
      paid_at = NULL,
      stripe_charged_cents = ${remainingChargedCents},
      stripe_charged_at = CASE WHEN ${remainingChargedCents === 0} THEN NULL ELSE stripe_charged_at END,
      audit_log = ${JSON.stringify(newLog)}::jsonb,
      updated_at = NOW()
    WHERE id = ${agreementId}
  `;
  const updatedRows = (await sql`
    SELECT * FROM agreements WHERE id = ${agreementId}
  `) as unknown as Agreement[];
  if (updatedRows[0]) await syncAgreementToAdvertiser(updatedRows[0]);
}
