// lib/inventory-filters.ts
//
// Shared filter logic for the InventoryBrowser (client) and the
// /api/inventory/pdf route (server). Keeping it in one place guarantees
// the PDF a user downloads matches exactly what they see filtered on
// /inventory and /builders.
//
// Filters map onto builder_inventory columns that actually exist:
//   builder (builder_name), beds (beds_max), baths (baths_max),
//   price (price_min/price_max), city (city), promo (promo_type).
// Listings and promotions are shown together; each card renders by its
// own row.kind. There is no kind filter — the Move-in/Promotions toggle
// was removed per product direction.

import type { BuilderInventoryRow, PromoType } from '@/lib/builder-inventory';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest';

export interface InventoryFilterState {
  beds: number; // 0 = Any
  baths: number; // 0 = Any
  priceMin: number | null;
  priceMax: number | null;
  builder: string | null;
  city: string | null;
  promo: PromoType | null;
  // Deep-link-only kind filter (no UI tab): ?kind=promotion shows just
  // promotions, ?kind=listing just move-in ready homes. null = both.
  kind: 'listing' | 'promotion' | null;
}

export const DEFAULT_FILTERS: InventoryFilterState = {
  beds: 0,
  baths: 0,
  priceMin: null,
  priceMax: null,
  builder: null,
  city: null,
  promo: null,
  kind: null,
};

const PROMO_VALUES: PromoType[] = [
  'rate_buydown',
  'incentive',
  'event',
  'broker_bonus',
  'other',
];

const SORT_VALUES: SortKey[] = ['featured', 'price-asc', 'price-desc', 'newest'];

export function matchesFilter(row: BuilderInventoryRow, f: InventoryFilterState): boolean {
  if (f.kind && row.kind !== f.kind) return false;
  if (f.builder && row.builderName !== f.builder) return false;
  if (f.beds > 0 && (row.bedsMax == null || row.bedsMax < f.beds)) return false;
  if (f.baths > 0 && (row.bathsMax == null || row.bathsMax < f.baths)) return false;
  if (f.city && row.city !== f.city) return false;
  if (f.promo && row.promoType !== f.promo) return false;
  if (f.priceMin != null || f.priceMax != null) {
    const rpMin = row.priceMin ?? row.priceMax;
    const rpMax = row.priceMax ?? row.priceMin;
    // Drop rows with no price at all once a price filter is active.
    if (rpMin == null || rpMax == null) return false;
    if (f.priceMin != null && rpMax < f.priceMin) return false;
    if (f.priceMax != null && rpMin > f.priceMax) return false;
  }
  return true;
}

function rowTime(r: BuilderInventoryRow): number {
  // created_at arrives from Neon (@neondatabase/serverless) as a Date for
  // TIMESTAMPTZ columns — NOT a string. Date has no localeCompare, so we
  // normalize to a numeric timestamp (works for Date | string | number).
  const t = new Date(r.createdAt as unknown as string).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function sortRows(
  rows: BuilderInventoryRow[],
  sort: SortKey,
): BuilderInventoryRow[] {
  const arr = [...rows];
  switch (sort) {
    case 'price-asc':
      arr.sort((a, b) => (a.priceMin ?? Infinity) - (b.priceMin ?? Infinity));
      break;
    case 'price-desc':
      arr.sort((a, b) => (b.priceMin ?? -Infinity) - (a.priceMin ?? -Infinity));
      break;
    case 'newest':
      arr.sort((a, b) => rowTime(b) - rowTime(a));
      break;
    default:
      arr.sort(
        (a, b) =>
          Number(b.featured) - Number(a.featured) || rowTime(b) - rowTime(a),
      );
  }
  return arr;
}

export function activeFilterCount(f: InventoryFilterState): number {
  return (
    (f.kind ? 1 : 0) +
    (f.beds > 0 ? 1 : 0) +
    (f.baths > 0 ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.builder ? 1 : 0) +
    (f.city ? 1 : 0) +
    (f.promo ? 1 : 0)
  );
}

function parseNum(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse filter state + sort from a Next.js searchParams record. */
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): { filters: InventoryFilterState; sort: SortKey } {
  const get = (k: string): string | undefined => {
    const v = sp[k];
    return typeof v === 'string' ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const promoRaw = get('promo');
  const promo =
    promoRaw && PROMO_VALUES.includes(promoRaw as PromoType)
      ? (promoRaw as PromoType)
      : null;
  const sortRaw = get('sort');
  const sort = sortRaw && SORT_VALUES.includes(sortRaw as SortKey)
    ? (sortRaw as SortKey)
    : 'featured';
  const kindRaw = get('kind');
  const kind =
    kindRaw === 'listing' || kindRaw === 'promotion' ? kindRaw : null;
  return {
    filters: {
      beds: parseNum(get('beds')) ?? 0,
      baths: parseNum(get('baths')) ?? 0,
      priceMin: parseNum(get('pmin')),
      priceMax: parseNum(get('pmax')),
      builder: get('builder') || null,
      city: get('city') || null,
      promo,
      kind,
    },
    sort,
  };
}

/**
 * Serialize filter state + sort to a query string (no leading `?` when empty,
 * otherwise `?k=v&...`). Used to keep the URL in sync (replaceState) so the
 * view is shareable and the floater's Download-results button can append the
 * same params to the PDF endpoint.
 */
export function serializeFilters(f: InventoryFilterState, sort: SortKey): string {
  const p = new URLSearchParams();
  if (f.beds > 0) p.set('beds', String(f.beds));
  if (f.baths > 0) p.set('baths', String(f.baths));
  if (f.priceMin != null) p.set('pmin', String(f.priceMin));
  if (f.priceMax != null) p.set('pmax', String(f.priceMax));
  if (f.builder) p.set('builder', f.builder);
  if (f.city) p.set('city', f.city);
  if (f.promo) p.set('promo', f.promo);
  if (f.kind) p.set('kind', f.kind);
  if (sort !== 'featured') p.set('sort', sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}
