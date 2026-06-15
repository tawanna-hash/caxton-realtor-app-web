// Pre-launch market display helpers.
//
// Phase 1 (PR #106) introduced this file as a separate registry of future
// markets that lived OUTSIDE the PubKey type. Phase 2 PR A promoted
// 'realtyline-houston' and 'realtyline-dallas' into PubKey so the rest of
// the app can render them as real publications with empty-shell content.
//
// What lives here now: tile-rendering metadata for the picker's pre-launch
// section (monogram + tile copy). Brand colors, names, cities, etc. come
// from PUB_META so a market only has one source of truth.

import type { PubKey } from './pub-meta';
import { PRE_LAUNCH_PUB_KEYS, isPreLaunchPub, PUB_META } from './pub-meta';

// Re-exports for callers that imported the old surface.
export { PRE_LAUNCH_PUB_KEYS, isPreLaunchPub };

// Legacy alias for ComingSoonPubId - kept so existing imports keep working.
// New code should use `PubKey` and filter with `isPreLaunchPub`.
export type ComingSoonPubId = Extract<
  PubKey,
  'realtyline-houston' | 'realtyline-dallas'
>;

export interface PreLaunchTileMeta {
  id: ComingSoonPubId;
  name: string;
  city: string;
  tagline: string;
  color: string;
  // Two-letter monogram shown on the tile.
  monogram: string;
}

// Monogram lookup - pulled out so the picker doesn't have to know about
// pub-key-to-initial mapping.
const MONOGRAM: Record<ComingSoonPubId, string> = {
  'realtyline-houston': 'RH',
  'realtyline-dallas': 'RD',
};

// Tile-friendly tagline for the picker. PUB_META.tagline is ad-sales copy;
// the picker wants something shorter.
const TILE_TAGLINE: Record<ComingSoonPubId, string> = {
  'realtyline-houston': 'Coming Soon - Be the first to know',
  'realtyline-dallas': 'Coming Soon - Be the first to know',
};

export const COMING_SOON_PUBS: PreLaunchTileMeta[] = (
  PRE_LAUNCH_PUB_KEYS.filter(
    (k): k is ComingSoonPubId => k === 'realtyline-houston' || k === 'realtyline-dallas',
  )
).map((id) => {
  const meta = PUB_META[id];
  return {
    id,
    name: meta.name,
    city: meta.city,
    tagline: TILE_TAGLINE[id],
    color: meta.color,
    monogram: MONOGRAM[id],
  };
});

export function isComingSoonPub(id: string): id is ComingSoonPubId {
  return id === 'realtyline-houston' || id === 'realtyline-dallas';
}
