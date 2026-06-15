// Per-publication ad slot inventory registry (Phase 2 PR C skeleton).
//
// Status: SKELETON. Realtyline + Newsline keep their existing inventory
// inferred from APP_AD_SLOTS in lib/media-kit.ts and the `ad_campaigns`
// table. This file ONLY surfaces the pre-launch markets (Houston/Dallas)
// as empty inventory so any UI that iterates pubs (e.g. ad inquiry
// builder, media-kit picker) has a stable shape to switch on.
//
// PR D activation steps:
//   1. Owner provides Houston/Dallas slot dimensions + opening-day rate card
//   2. Add real entries below
//   3. Flip isPubInventoryReady() to true via a non-empty `slots` array
//   4. Widen CheckoutPub in lib/server/slot-availability.ts to include the
//      newly-activated pub key
//
// Until then, isPubInventoryReady('realtyline-houston') === false and the
// inquiry/checkout UI MUST skip those pubs in the picker.

import { type PubKey } from '@/lib/pub-meta';

export interface AdSlotSpec {
  // Stable slot key matching lib/media-kit.ts APP_AD_SLOTS.slug values where
  // possible so a Houston slot named feed_inline_card behaves the same as
  // its Austin counterpart.
  slug: string;
  label: string;
  // Pixel dimensions admins should target when uploading creative.
  width: number;
  height: number;
  // Whether the slot rotates among multiple campaigns (true) or holds a
  // single sponsorship for the campaign window (false).
  rotates: boolean;
}

export interface PubInventory {
  slots: AdSlotSpec[];
  // Free-form notes for the rate card. Surfaced on the public media-kit
  // page below the pricing table.
  notes?: string;
}

// INVENTORY is the source of truth for pre-launch market slot lists. Launched
// markets (realtyline, newsline) intentionally return undefined here so the
// legacy APP_AD_SLOTS in lib/media-kit.ts remains authoritative for them.
export const INVENTORY: Partial<Record<PubKey, PubInventory>> = {
  'realtyline-houston': {
    // TODO(houston-inventory): owner to provide slot list + dimensions.
    // Most likely mirror of Austin's slots but with Houston-specific
    // creative refresh cadence and rate card.
    slots: [],
    notes: 'Houston inventory opens Q3 2026 - rate card pending.',
  },
  'realtyline-dallas': {
    // TODO(dallas-inventory): see houston note above. Dallas rate card
    // expected to differ from Houston given DFW market depth.
    slots: [],
    notes: 'Dallas inventory opens Q3 2026 - rate card pending.',
  },
};

export function getPubInventory(pub: PubKey): PubInventory | undefined {
  return INVENTORY[pub];
}

export function isPubInventoryReady(pub: PubKey): boolean {
  const inv = INVENTORY[pub];
  if (!inv) return false; // launched pubs handle their own inventory elsewhere
  return inv.slots.length > 0;
}
