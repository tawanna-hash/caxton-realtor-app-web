// lib/publications.ts
//
// Canonical source of truth for publication identity, naming, and
// runtime selection across the Caxton Realtor App.
//
// Two ID schemes coexist here:
//
//   1. PublicationId ('austin' | 'san_antonio')
//      - Used by the admin surfaces (events, ads, subscribers, giveaways,
//        inventory). Stored in the database. Do NOT rename.
//
//   2. PubId ('realtyline' | 'newsline')
//      - Used by the public-facing app shell: header title-as-switcher,
//        More drawer publication block, first-launch onboarding picker,
//        cookie `caxton_pub`, localStorage `caxton_pub`, and the
//        `savedPubChange` event.
//      - Maps 1:1 onto PublicationId via the helpers below.
//
// Session 13 audit (Batch 12) identified SEVEN distinct format variants
// for "RealtyLine" across admin views; that's why we have so many label
// maps. Session 14 (this session) added the PubId / MarketSwitcherSheet
// surface on top. Both layers must stay in sync.

// -----------------------------------------------------------------------------
// Admin (database-backed) publication catalog
// -----------------------------------------------------------------------------

export type PublicationId = 'austin' | 'san_antonio';

export interface Publication {
  id: PublicationId;
  name: string;
  market: string;
  // Use cases:
  // - label: most contexts — form dropdowns, table cells, badges
  // - filterLabel: space-constrained filter pills only
  label: string;
  filterLabel: string;
  // Pill background + text styles, matching the existing PUB_STYLES on
  // app/admin/events/page.tsx so the migration is visually no-op.
  pillStyle: string;
}

export const PUBLICATIONS: readonly Publication[] = [
  {
    id: 'austin',
    name: 'RealtyLine',
    market: 'Austin',
    label: 'RealtyLine Austin',
    filterLabel: 'RealtyLine',
    pillStyle: 'bg-[#301D5D]/10 text-[#301D5D] border-[#301D5D]/20',
  },
  {
    id: 'san_antonio',
    name: 'Newsline San Antonio',
    market: 'San Antonio',
    label: 'Newsline San Antonio',
    filterLabel: 'Newsline San Antonio',
    pillStyle: 'bg-[#301D5D]/10 text-[#301D5D] border-[#301D5D]/20',
  },
] as const;

// Convenience lookup by id. Throws if id is not a known publication —
// callers should only pass values typed as PublicationId.
// Legacy compatibility shim: callers that previously had a local
// PUB_LABELS or PUBLICATION_LABELS map keyed by id can use this directly.
// New code should prefer getPublication(id).label.
export const PUBLICATION_LABELS: Record<PublicationId, string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
};

// Same shape as above but with the short filter labels.
export const PUBLICATION_FILTER_LABELS: Record<PublicationId, string> = {
  austin: 'RealtyLine',
  san_antonio: 'Newsline San Antonio',
};

// Variant for surfaces that also support "both publications" scope.
// Currently used by ads campaigns where a campaign can target one or both pubs.
// (Builder inventory uses a different legacy scheme — see FOLLOW_UP #84.)
export const PUBLICATION_LABELS_WITH_BOTH: Record<PublicationId | 'both', string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
  both: 'Both publications',
};

// -----------------------------------------------------------------------------
// Public app (cookie-backed) publication catalog
// -----------------------------------------------------------------------------
//
// Surfaced in:
//   - The header title-as-switcher (MarketSwitcherSheet)
//   - The More drawer publication block (NavDrawer)
//   - The first-launch onboarding picker (MarketOnboardingPicker)
//
// "advertisers and clients are the same thing" — likewise, the user's chosen
// publication is the global app context. Switching the publication forces a
// hard reload to '/' so server components, pub-scoped fetches, and chrome
// re-mount with the new context (the BUG-03 fix).

export type PubId = 'realtyline' | 'newsline';

export type PubMeta = {
  id: PubId;
  /** Full display label, e.g. "RealtyLine Austin". */
  label: string;
  /** Short label for compact contexts (header chips, bottom-nav). */
  shortLabel: string;
  /** Two-letter monogram for avatar circles. */
  monogram: string;
};

export type ComingSoonPub = {
  id: string;
  label: string;
  shortLabel: string;
  monogram: string;
};

export const PUB_ACTIVE: PubMeta[] = [
  {
    id: 'realtyline',
    label: 'RealtyLine Austin',
    shortLabel: 'Austin',
    monogram: 'RL',
  },
  {
    id: 'newsline',
    label: 'Newsline San Antonio',
    shortLabel: 'San Antonio',
    monogram: 'NS',
  },
];

export const PUB_COMING_SOON: ComingSoonPub[] = [
  {
    id: 'realtyline-houston',
    label: 'RealtyLine Houston',
    shortLabel: 'Houston',
    monogram: 'RH',
  },
  {
    id: 'realtyline-dallas',
    label: 'RealtyLine Dallas/Ft. Worth',
    shortLabel: 'Dallas/FW',
    monogram: 'RD',
  },
];

/** Resolve a PubMeta by id. Returns null for coming-soon or unknown ids. */
export function getActivePub(id: string | null | undefined): PubMeta | null {
  if (!id) return null;
  return PUB_ACTIVE.find((p) => p.id === id) ?? null;
}

/** Persist the chosen publication and notify all listeners.
 *
 * Writes the cookie (the source of truth for server components) and the
 * legacy localStorage mirror, clears strands (saved article/event), and
 * dispatches the 'savedPubChange' event that AppShell listens for. The
 * caller is responsible for any subsequent navigation (we don't reload
 * here so callers can decide between hard reload vs. router.push).
 */
export function persistPub(id: PubId): void {
  if (typeof window === 'undefined') return;
  try {
    const maxAge = 60 * 60 * 24 * 365; // 365 days
    document.cookie = `caxton_pub=${id}; path=/; max-age=${maxAge}; SameSite=Lax`;
    localStorage.setItem('caxton_pub', id);
    localStorage.removeItem('caxton_selected_article');
    localStorage.removeItem('caxton_selected_event');
    window.dispatchEvent(new Event('savedPubChange'));
  } catch {
    /* ignore — quota / privacy mode */
  }
}
