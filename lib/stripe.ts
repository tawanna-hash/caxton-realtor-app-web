// lib/stripe.ts
//
// Server-side Stripe SDK init. Singleton.
// Reads STRIPE_SECRET_KEY from env. Lazy — never throws at import time.

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
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
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
