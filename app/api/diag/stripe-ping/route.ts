// app/api/_diag/stripe-ping/route.ts
//
// Diagnostic endpoint: does a minimal `stripe.balance.retrieve()` call and
// returns the raw error / success info so we can isolate whether the SDK is
// generally reaching Stripe from this Vercel function. NOT for production use
// by end users — only for debugging Stripe connection issues.
//
// GET /api/_diag/stripe-ping

import { NextResponse } from 'next/server';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ErrInfo {
  message: string;
  type?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  raw?: unknown;
}

function extractErr(err: unknown): ErrInfo {
  const out: ErrInfo = {
    message: err instanceof Error ? err.message : String(err),
  };
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.type === 'string') out.type = e.type;
    if (typeof e.code === 'string') out.code = e.code;
    if (typeof e.statusCode === 'number') out.statusCode = e.statusCode;
    if (typeof e.requestId === 'string') out.requestId = e.requestId;
    if (e.raw) out.raw = e.raw;
  }
  return out;
}

export async function GET() {
  const started = Date.now();
  const env = {
    has_secret_key: Boolean(process.env.STRIPE_SECRET_KEY),
    secret_key_prefix: process.env.STRIPE_SECRET_KEY
      ? process.env.STRIPE_SECRET_KEY.slice(0, 8)
      : null,
    has_publishable_key: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
    publishable_key_prefix: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.slice(0, 8)
      : null,
    has_webhook_secret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    node_version: process.version,
    region: process.env.VERCEL_REGION ?? null,
  };

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, stage: 'config', env, error: 'STRIPE_SECRET_KEY missing' },
      { status: 503 },
    );
  }

  // Stage 1: raw fetch to Stripe API (proves egress works at all)
  let rawFetch: { ok: boolean; status?: number; statusText?: string; bodyPreview?: string; error?: string; elapsedMs?: number } = { ok: false };
  try {
    const t0 = Date.now();
    const r = await fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    });
    const body = await r.text();
    rawFetch = {
      ok: r.ok,
      status: r.status,
      statusText: r.statusText,
      bodyPreview: body.slice(0, 400),
      elapsedMs: Date.now() - t0,
    };
  } catch (err) {
    rawFetch = { ok: false, error: extractErr(err).message };
  }

  // Stage 2: SDK call (the actual code path the payment-intent route uses)
  let sdk: { ok: boolean; error?: ErrInfo; elapsedMs?: number; available?: unknown } = { ok: false };
  try {
    const t0 = Date.now();
    const stripe = getStripe();
    const bal = await stripe.balance.retrieve();
    sdk = {
      ok: true,
      elapsedMs: Date.now() - t0,
      available: bal.available?.map((a) => ({ amount: a.amount, currency: a.currency })) ?? [],
    };
  } catch (err) {
    sdk = { ok: false, error: extractErr(err) };
  }

  // Stage 3: SDK paymentIntents.create dry-run (the actual failing call)
  let piCreate: { ok: boolean; error?: ErrInfo; elapsedMs?: number; pi_id?: string } = { ok: false };
  try {
    const t0 = Date.now();
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'usd',
      automatic_payment_methods: { enabled: true },
      statement_descriptor: 'REALTYLINE AUSTIN',
      description: 'diag ping — safe to cancel',
      metadata: { diag: '1' },
    });
    piCreate = { ok: true, elapsedMs: Date.now() - t0, pi_id: pi.id };
    // Clean up so we don't pollute the dashboard
    try { await stripe.paymentIntents.cancel(pi.id); } catch { /* ignore */ }
  } catch (err) {
    piCreate = { ok: false, error: extractErr(err) };
  }

  return NextResponse.json({
    ok: rawFetch.ok && sdk.ok && piCreate.ok,
    env,
    raw_fetch: rawFetch,
    sdk_balance: sdk,
    sdk_payment_intent_create: piCreate,
    total_elapsed_ms: Date.now() - started,
  });
}
