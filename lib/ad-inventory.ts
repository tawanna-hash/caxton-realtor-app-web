// Per-publication ad inventory readiness.
//
// Phase 2 PR C shipped this file as a per-pub slot list, but the actual
// architecture keeps the slot catalog in lib/media-kit.ts (APP_AD_SLOTS)
// and treats every pub equivalently — a pub either uses that catalog or
// it doesn't. Phase 2 PR D flipped Houston and Dallas to inherit the
// Austin/SA digital + email catalog at identical single-pub rates per
// owner direction, so all four pubs share APP_AD_SLOTS.
//
// This file exists so future per-market overrides (e.g. a Houston-only
// promo strip with custom pricing) have a stable hook: any pub that
// returns a non-empty list from getPubAdSlotOverrides() means \"use this
// instead of the shared APP_AD_SLOTS catalog\". Empty / undefined = use
// the shared catalog.

import { type PubKey } from '@/lib/pub-meta';

export interface AdSlotOverride {
  slug: string;
  label: string;
  weeklySingle: number;
  notes: string;
}

// No overrides today — every pub shares APP_AD_SLOTS. Add entries here
// only when a market needs a slot that doesn't exist (or a different
// rate) versus the shared catalog.
export const AD_SLOT_OVERRIDES: Partial<Record<PubKey, AdSlotOverride[]>> = {};

export function getPubAdSlotOverrides(pub: PubKey): AdSlotOverride[] {
  return AD_SLOT_OVERRIDES[pub] ?? [];
}

export function pubHasAdSlotOverrides(pub: PubKey): boolean {
  return getPubAdSlotOverrides(pub).length > 0;
}
