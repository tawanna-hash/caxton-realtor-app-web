// lib/types/markets.ts
//
// Single Source of Truth for the admin-side market/publication identifier.
// The admin DB stores publication as one of these strings; admin UIs
// (subscribers list, newsletter list, mailing tools) filter by this union.
//
// Public-side `PubId` ('realtyline' | 'newsline' | 'realtyline-houston' |
// 'realtyline-dallas') lives in lib/publications.ts because public surfaces
// speak publication brand names, not city slugs.
// Use `marketToPubId` / `pubIdToMarket` to bridge.

export const MARKETS = ['austin', 'san_antonio', 'houston', 'dallas'] as const;
export type Market = (typeof MARKETS)[number];

export const MARKET_LABELS: Record<Market, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
  houston: 'Houston',
  dallas: 'Dallas / Ft. Worth',
};

// Legacy — historically only Austin + San Antonio were live, so a lot of
// existing UI enumerates these two + 'both'. Keep the union around for
// back-compat with `ad_campaigns.publication`, checkout flow, etc.
export const MARKETS_WITH_BOTH = ['austin', 'san_antonio', 'both'] as const;
export type MarketWithBoth = (typeof MARKETS_WITH_BOTH)[number];

// ── Live-status registry ─────────────────────────────────────────────
// Which markets are open for business today. Houston + Dallas are stubbed
// in the type system + rate cards, but public-facing pages show a "Coming
// soon" badge and admin surfaces mute them.
export const LIVE_MARKETS: readonly Market[] = ['austin', 'san_antonio'] as const;

export type MarketStatus = 'live' | 'coming_soon';

export interface MarketMeta {
  id: Market;
  label: string;
  status: MarketStatus;
  // Brand name for this market's flagship publication. Digital slots share
  // one catalog across all pubs; magazines/print stay pub-specific.
  publication: 'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas';
}

export const MARKET_META: Record<Market, MarketMeta> = {
  austin: {
    id: 'austin',
    label: 'Austin',
    status: 'live',
    publication: 'realtyline',
  },
  san_antonio: {
    id: 'san_antonio',
    label: 'San Antonio',
    status: 'live',
    publication: 'newsline',
  },
  houston: {
    id: 'houston',
    label: 'Houston',
    status: 'coming_soon',
    publication: 'realtyline-houston',
  },
  dallas: {
    id: 'dallas',
    label: 'Dallas / Ft. Worth',
    status: 'coming_soon',
    publication: 'realtyline-dallas',
  },
};

export function isMarket(v: unknown): v is Market {
  return v === 'austin' || v === 'san_antonio' || v === 'houston' || v === 'dallas';
}

export function isMarketLive(m: Market): boolean {
  return LIVE_MARKETS.includes(m);
}

export function marketsInOrder(): Market[] {
  // Live markets first, then coming-soon markets, both alphabetical by label.
  const live = [...LIVE_MARKETS].sort((a, b) =>
    MARKET_META[a].label.localeCompare(MARKET_META[b].label),
  );
  const soon = MARKETS.filter((m) => !isMarketLive(m)).sort((a, b) =>
    MARKET_META[a].label.localeCompare(MARKET_META[b].label),
  );
  return [...live, ...soon];
}
