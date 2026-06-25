// lib/types/markets.ts
//
// Single Source of Truth for the admin-side market/publication identifier.
// The admin DB stores publication as one of these two strings; admin UIs
// (subscribers list, newsletter list, mailing tools) filter by this union.
//
// Public-side `PubId` ('realtyline' | 'newsline') lives in lib/publications.ts
// because public surfaces speak publication brand names, not city slugs.
// Use `marketToPubId` / `pubIdToMarket` to bridge.

export const MARKETS = ['austin', 'san_antonio'] as const;
export type Market = (typeof MARKETS)[number];

export const MARKET_LABELS: Record<Market, string> = {
  austin: 'Austin',
  san_antonio: 'San Antonio',
};

export const MARKETS_WITH_BOTH = ['austin', 'san_antonio', 'both'] as const;
export type MarketWithBoth = (typeof MARKETS_WITH_BOTH)[number];

export function isMarket(v: unknown): v is Market {
  return v === 'austin' || v === 'san_antonio';
}
