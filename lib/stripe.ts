// lib/stripe.ts
//
// Stripe has been removed. This module is a disabled stub so existing imports still compile.
import type Stripe from 'stripe';
import { processingFeeCents } from '@/lib/payment-processing-fees';

export function getStripe(): Stripe {
  throw new Error('Stripe has been removed from this app.');
}

/** Apply the credit-card processing fee (editable in Payment settings; default 3%). */
export function withSurcharge(amountCents: number): number {
  return Math.round(amountCents) + processingFeeCents(amountCents, 'card');
}

/** Stripe is removed: always false, so every payment path reports "not configured". */
export function isStripeConfigured(): boolean {
  return false;
}

export function getPublishableKey(): string | undefined {
  return undefined;
}

export function getWebhookSecret(): string | undefined {
  return undefined;
}
