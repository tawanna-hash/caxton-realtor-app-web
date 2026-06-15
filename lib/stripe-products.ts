// Per-publication checkout readiness registry.
//
// Background: Stripe payment intents are created server-side from
// APP_AD_SLOTS (lib/media-kit.ts) rate cards — there are no fixed
// Stripe Product/Price IDs to maintain per pub. The PR C version of
// this file modeled product IDs as if there were; that was wrong.
//
// What this file actually exposes is a single boolean per pub: is the
// market ready to accept paid bookings via the public checkout flow?
//
// Phase 2 PR D activated Houston and Dallas to inherit the same digital +
// email rate card as RealtyLine (Austin). Both flip to `true` here.

import { PUB_KEYS, type PubKey } from '@/lib/pub-meta';

// Markets that are wired into checkout/create-intent and slot-availability
// and may transact paid bookings. Houston/Dallas were added Phase 2 PR D
// after the user confirmed they share the digital + email products with
// RealtyLine Austin at identical rates.
const CHECKOUT_READY: Record<PubKey, boolean> = {
  realtyline: true,
  newsline: true,
  'realtyline-houston': true,
  'realtyline-dallas': true,
};

export function isPubCheckoutReady(pub: PubKey): boolean {
  return CHECKOUT_READY[pub] === true;
}

export function getCheckoutReadyPubs(): PubKey[] {
  return PUB_KEYS.filter(isPubCheckoutReady);
}
