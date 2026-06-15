// Per-publication Stripe product/price registry (Phase 2 PR C skeleton).
//
// Status: SKELETON. Real Stripe Product + Price IDs need to be created in the
// Stripe Dashboard (or via the API) for Houston and Dallas before this file
// can ship paid checkout for those markets. The structure mirrors how
// realtyline/newsline are wired into checkout/SignWizard today so the eventual
// activation is a one-line PRODUCTS edit + a CHECK on isPubProductReady().
//
// Why this exists now: Phase 2 PR B opened the ?pub= deep link for admin
// previews of Houston/Dallas. PR D (sales activation) will:
//   1. Create the real Stripe products via the dashboard
//   2. Replace the TODO_* placeholders below with the real price_xxx IDs
//   3. Flip isPubProductReady() to true once paid checkout is desired
//
// Until then, isPubProductReady('realtyline-houston') === false and the
// checkout UI MUST guard on this before showing pricing.

import { PUB_KEYS, type PubKey } from '@/lib/pub-meta';

export interface PubProductPlan {
  // Stripe Product ID (prod_xxx).
  productId: string;
  // Stripe Price IDs keyed by SKU / placement. The placement keys here mirror
  // the slot keys in lib/ad-inventory.ts so a slot quote can look up its
  // price by (pub, placement).
  priceIds: {
    feed_inline_card?: string;
    article_banner?: string;
    sidebar_skyscraper?: string;
    sponsored_email?: string;
  };
  currency: 'usd';
}

// PRODUCTS is the source of truth. Pre-launch markets get TODO_* placeholders;
// activation flips them to real Stripe IDs.
export const PRODUCTS: Record<PubKey, PubProductPlan> = {
  realtyline: {
    // TODO(stripe-prod): swap to the real RealtyLine (Austin) Stripe product
    // once we lift checkout out of the per-route inline price strings.
    productId: 'TODO_REALTYLINE_PRODUCT_ID',
    priceIds: {},
    currency: 'usd',
  },
  newsline: {
    // TODO(stripe-prod): same as above for Newsline San Antonio.
    productId: 'TODO_NEWSLINE_PRODUCT_ID',
    priceIds: {},
    currency: 'usd',
  },
  'realtyline-houston': {
    // TODO(stripe-prod): create Stripe product "RealtyLine Houston" and
    // populate prices. Houston rate card pending owner sign-off.
    productId: 'TODO_REALTYLINE_HOUSTON_PRODUCT_ID',
    priceIds: {},
    currency: 'usd',
  },
  'realtyline-dallas': {
    // TODO(stripe-prod): create Stripe product "RealtyLine Dallas" and
    // populate prices. Dallas rate card pending owner sign-off.
    productId: 'TODO_REALTYLINE_DALLAS_PRODUCT_ID',
    priceIds: {},
    currency: 'usd',
  },
};

// True once a pub has at least one real Stripe Price ID wired in. UI callers
// (CheckoutForm, MediaKitClient, the ad inquiry builder) must hide pricing
// CTAs for any pub that returns false here.
export function isPubProductReady(pub: PubKey): boolean {
  const plan = PRODUCTS[pub];
  if (!plan) return false;
  if (plan.productId.startsWith('TODO_')) return false;
  return Object.values(plan.priceIds).some(
    (id) => typeof id === 'string' && id.length > 0 && !id.startsWith('TODO_'),
  );
}

// Returns the set of pubs that are fully ready to take a Stripe checkout.
// Used by the admin dashboard "ready markets" badge.
export function getStripeReadyPubs(): PubKey[] {
  return PUB_KEYS.filter(isPubProductReady);
}
