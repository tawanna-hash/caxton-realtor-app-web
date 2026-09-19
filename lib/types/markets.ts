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
// ── Live-status registry ─────────────────────────────────────────────
// Which markets are open for business today.
const LIVE_MARKETS: readonly Market[] = MARKETS;

type MarketStatus = 'live' | 'coming_soon';

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
    status: 'live',
    publication: 'realtyline-houston',
  },
  dallas: {
    id: 'dallas',
    label: 'Dallas / Ft. Worth',
    status: 'live',
    publication: 'realtyline-dallas',
  },
};

export function isMarketLive(m: Market): boolean {
  return LIVE_MARKETS.includes(m);
}
