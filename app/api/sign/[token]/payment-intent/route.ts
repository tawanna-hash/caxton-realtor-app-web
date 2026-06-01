// app/api/sign/[token]/payment-intent/route.ts
//
// POST — Create or retrieve a Stripe PaymentIntent for the first issue charge.
// Public route (token-auth). Called by the Sign Wizard before Stripe Payment Element submit.
//
// Flow:
//   1. Verify HMAC token → agreementId
//   2. Load agreement; require ad_rate_cents present
//   3. Reuse Stripe customer if stripe_customer_id already set; else create
//   4. Create PaymentIntent for ad_rate * 1.03 (surcharge included) with
//      setup_future_usage: 'off_session' so we can re-charge for future issues
//   5. Persist payment_intent_id + customer_id on the agreement
//   6. Return { clientSecret, publishableKey, amountCents }

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { getStripe, isStripeConfigured, withSurcharge } from '@/lib/stripe';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe not configured. Set STRIPE_SECRET_KEY in Vercel env.' },
      { status: 503 },
    );
  }
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured.' },
      { status: 503 },
    );
  }

  const { token } = await ctx.params;
  const v = verifyToken(token);
  if (!v) return NextResponse.json({ error: 'invalid token' }, { status: 401 });

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`SELECT * FROM agreements WHERE id = ${v.agreementId}`) as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    if (!ag.ad_rate_cents || ag.ad_rate_cents <= 0) {
      return NextResponse.json(
        { error: 'Select an ad package first \u2014 ad rate is required before payment.' },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const baseCents = ag.ad_rate_cents;
    const totalCents = withSurcharge(baseCents);
    const surchargeCents = totalCents - baseCents;

    // 1. Customer (idempotent: reuse if already on agreement; else find/create by email)
    let customerId = ag.stripe_customer_id ?? null;
    if (!customerId) {
      const email = ag.advertiser_email ?? ag.billing_email ?? undefined;
      // Search before creating to dedupe across agreements
      if (email) {
        const found = await stripe.customers.list({ email, limit: 1 });
        if (found.data.length > 0) {
          customerId = found.data[0].id;
        }
      }
      if (!customerId) {
        const created = await stripe.customers.create({
          email,
          name: ag.company_name ?? ag.rep_name ?? undefined,
          phone: ag.advertiser_phone ?? undefined,
          metadata: { agreement_id: ag.id, publication: 'RealtyLine' },
        });
        customerId = created.id;
      }
      await sql`UPDATE agreements SET stripe_customer_id = ${customerId}, updated_at = NOW() WHERE id = ${ag.id}`;
    }

    // 2. PaymentIntent
    let piId = ag.stripe_payment_intent_id ?? null;
    let pi: import('stripe').Stripe.PaymentIntent | null = null;

    if (piId) {
      // Reuse if still chargeable
      try {
        const existing = await stripe.paymentIntents.retrieve(piId);
        if (
          existing.status === 'requires_payment_method' ||
          existing.status === 'requires_confirmation' ||
          existing.status === 'requires_action'
        ) {
          // Update amount if it changed (e.g. client picked a different package mid-flow)
          if (existing.amount !== totalCents) {
            pi = await stripe.paymentIntents.update(piId, {
              amount: totalCents,
              metadata: {
                agreement_id: ag.id,
                base_amount_cents: String(baseCents),
                surcharge_cents: String(surchargeCents),
              },
            });
          } else {
            pi = existing;
          }
        }
      } catch {
        // PI not found or unusable; fall through to create a new one
        piId = null;
      }
    }

    if (!pi) {
      pi = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        customer: customerId,
        // Save the payment method for future off-session issue charges
        setup_future_usage: 'off_session',
        automatic_payment_methods: { enabled: true },
        description: `${ag.company_name ?? 'Advertiser'} \u2014 ${ag.ad_size ?? 'ad'} \u2014 first issue`,
        receipt_email: ag.advertiser_email ?? ag.billing_email ?? undefined,
        metadata: {
          agreement_id: ag.id,
          base_amount_cents: String(baseCents),
          surcharge_cents: String(surchargeCents),
          publication: 'RealtyLine',
        },
      });
      await sql`UPDATE agreements SET stripe_payment_intent_id = ${pi.id}, updated_at = NOW() WHERE id = ${ag.id}`;
    }

    return NextResponse.json({
      clientSecret: pi.client_secret,
      publishableKey,
      paymentIntentId: pi.id,
      amountCents: totalCents,
      baseCents,
      surchargeCents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[sign/payment-intent] error:', msg);
    return NextResponse.json({ error: 'payment intent failed', detail: msg }, { status: 500 });
  }
}
