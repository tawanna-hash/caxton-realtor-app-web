// lib/publications.ts
// Canonical source of truth for publication identity and naming across
// the Caxton Realtor App.
//
// Session 13 audit (Batch 12) identified SEVEN distinct format variants
// for "RealtyLine" across admin views:
//   - Hamburger menu               -> "RealtyLine"
//   - Events form dropdown         -> "RealtyLine (Austin)"
//   - Events list filter pill      -> "RealtyLine"
//   - Events list table Pub badge  -> "RealtyLine"
//   - Campaigns Pubs column        -> "Both publications"
//   - Subscribers filter dropdown  -> "RealtyLine (Austin)"
//   - Inventory review dropdown    -> "RealtyLine only"
//
// This module exists to consolidate all of those into a single set of
// well-named constants. Consumers MUST import from here, not inline.

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
    label: 'RealtyLine (Austin)',
    filterLabel: 'RealtyLine',
    pillStyle: 'bg-[#021D40]/10 text-[#021D40] border-[#021D40]/20',
  },
  {
    id: 'san_antonio',
    name: 'Newsline',
    market: 'San Antonio',
    label: 'Newsline (SA)',
    filterLabel: 'Newsline SA',
    pillStyle: 'bg-[#3D0740]/10 text-[#3D0740] border-[#3D0740]/20',
  },
] as const;

// Convenience lookup by id. Throws if id is not a known publication —
// callers should only pass values typed as PublicationId.
export function getPublication(id: PublicationId): Publication {
  const found = PUBLICATIONS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Unknown publication id: ${id}`);
  }
  return found;
}

// Legacy compatibility shim: callers that previously had a local
// PUB_LABELS or PUBLICATION_LABELS map keyed by id can use this directly.
// New code should prefer getPublication(id).label.
export const PUBLICATION_LABELS: Record<PublicationId, string> = {
  austin: 'RealtyLine (Austin)',
  san_antonio: 'Newsline (SA)',
};

// Same shape as above but with the short filter labels.
export const PUBLICATION_FILTER_LABELS: Record<PublicationId, string> = {
  austin: 'RealtyLine',
  san_antonio: 'Newsline SA',
};
