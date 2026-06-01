// lib/stripe.ts
//
// Server-side Stripe SDK init. Singleton.
// Reads STRIPE_SECRET_KEY from env. Lazy — never throws at import time.

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  // Trim! Vercel env-var pasting can introduce trailing \n which Node's strict
  // http header validator rejects with ERR_INVALID_CHAR → SDK retries fail with
  // StripeConnectionError. fetch() tolerates it; Stripe SDK does not.
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to Vercel env vars (Settings → Environment Variables).',
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
    appInfo: {
      name: 'caxton-realtor-app',
      version: '1.0.0',
    },
  });
  return _stripe;
}

/** Apply the 3% credit-card surcharge that's shown in the Sign Wizard. */
export function withSurcharge(amountCents: number): number {
  return Math.round(amountCents * 1.03);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Trimmed publishable key (strips stray whitespace/newlines from Vercel env). */
export function getPublishableKey(): string | undefined {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || undefined;
}

/** Trimmed webhook signing secret. */
export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}
