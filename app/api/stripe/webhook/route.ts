// app/api/stripe/webhook/route.ts
//
// Stripe webhook endpoint. Verifies signature, processes payment events,
// marks the agreement paid, and fires the Wave (Zapier) webhook.
//
// Stripe Dashboard → Developers → Webhooks → Add endpoint:
//   URL:    https://realtynewsnow.app/api/stripe/webhook
//   Events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded
// Then set STRIPE_WEBHOOK_SECRET in Vercel env to the whsec_... value Stripe gives.

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { fireWaveInvoiceWebhook } from '@/lib/wave-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
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
      default:
        // Ignore other events; respond 2xx so Stripe doesn't retry.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe-webhook] handler error:', msg);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: 'handler failed', detail: msg }, { status: 500 });
  }
}

async function handlePaymentSucceeded(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
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

  const baseCents = Number(pi.metadata?.base_amount_cents ?? pi.amount_received);
  const surchargeCents = Number(pi.metadata?.surcharge_cents ?? 0);
  const paymentMethodId =
    typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id ?? null;
  const chargeId =
    typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null;

  // Idempotent: only mark paid if not already
  if (!ag.paid_at) {
    await sql`
      UPDATE agreements SET
        paid_at = NOW(),
        stripe_charged_cents = ${pi.amount_received},
        stripe_charged_at = NOW(),
        stripe_payment_method_id = ${paymentMethodId},
        stripe_customer_id = ${typeof pi.customer === 'string' ? pi.customer : (pi.customer?.id ?? ag.stripe_customer_id)},
        updated_at = NOW()
      WHERE id = ${ag.id}
    `;
  }

  const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
    audit_log: AgreementAuditEntry[] | null;
  }>;
  const newLog = appendAudit(auditRows[0]?.audit_log, {
    event: 'stripe_payment_succeeded',
    timestamp: new Date().toISOString(),
    details: `Stripe charged ${(pi.amount_received / 100).toFixed(2)} ${pi.currency.toUpperCase()} \u2014 pi: ${pi.id}`,
  });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;

  // Reload to send fresh data to Wave
  const fresh = (await sql`SELECT * FROM agreements WHERE id = ${ag.id}`) as unknown as Agreement[];
  const result = await fireWaveInvoiceWebhook({
    ag: fresh[0],
    event: 'agreement-signed',
    baseAmountCents: baseCents,
    surchargeCents,
    stripePaymentIntentId: pi.id,
    stripeChargeId: chargeId,
  });
  if (result.ok && process.env.WAVE_ZAP_WEBHOOK_URL) {
    await sql`UPDATE agreements SET wave_invoice_synced_at = NOW() WHERE id = ${ag.id}`;
  }
}

async function handlePaymentFailed(
  sql: ReturnType<typeof getSql>,
  pi: Stripe.PaymentIntent,
): Promise<void> {
  const agreementId = pi.metadata?.agreement_id;
  if (!agreementId) return;

  const reason = pi.last_payment_error?.message ?? 'unknown';
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
  const agreementId =
    (typeof charge.payment_intent === 'string'
      ? null
      : charge.payment_intent?.metadata?.agreement_id) ?? charge.metadata?.agreement_id;
  if (!agreementId) return;

  const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${agreementId}`) as unknown as Array<{
    audit_log: AgreementAuditEntry[] | null;
  }>;
  if (auditRows.length === 0) return;

  const newLog = appendAudit(auditRows[0]?.audit_log, {
    event: 'stripe_refunded',
    timestamp: new Date().toISOString(),
    details: `charge: ${charge.id} \u2014 refunded ${(charge.amount_refunded / 100).toFixed(2)} ${charge.currency.toUpperCase()}`,
  });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb, updated_at = NOW() WHERE id = ${agreementId}`;
}
