'use client';

// InventoryBrowser — NewHomeSource-style search filters for the
// /inventory and /builders directories. Owns ALL filtering client-side so
// toggling Builder / Beds / Baths / Price / City / Promo-type / sort is
// instant (no full page reload).
//
// Filter state is seeded from the URL (parsed server-side by the host page
// and passed in as initialFilters/initialSort — keeps SSR + hydration in
// sync) and synced back to the URL via history.replaceState on every
// change. That makes a filtered view shareable and lets the floater's
// Download-results button append the same params to the PDF endpoint.
//
// The control surface is a single compact row of small <select> dropdowns
// (no big segmented pills or a separate filter panel) so the search bar
// stays tight on mobile — closer to NewHomeSource's compact search.
//
// Every filter change fires `inventory_filter_clicked` with { filter, value }
// so the existing admin metrics dashboard (filter_usage breakdown by
// properties.filter) picks it up. A mount-time `inventory_page_viewed`
// event with { surface, kind } tracks dedicated-page traffic.

import { useEffect, useMemo, useState } from 'react';
import type { BuilderInventoryRow, PromoType } from '@/lib/builder-inventory';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  matchesFilter,
  serializeFilters,
  sortRows,
  type InventoryFilterState,
  type SortKey,
} from '@/lib/inventory-filters';
import { trackEvent } from '@/app/posthog-provider';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import PageTitle from '@/components/ui/PageTitle';

export type InventorySurface = 'inventory' | 'promotions' | 'builders';

const BED_BATH_OPTS = [0, 1, 2, 3, 4, 5];

const PRICE_OPTS: { value: string; label: string; min: number | null; max: number | null }[] = [
  { value: '', label: 'Any price', min: null, max: null },
  { value: 'u400', label: 'Under $400k', min: null, max: 399_999 },
  { value: '400-600', label: '$400k–$600k', min: 400_000, max: 600_000 },
  { value: '600-800', label: '$600k–$800k', min: 600_000, max: 800_000 },
  { value: '800-1m', label: '$800k–$1M', min: 800_000, max: 1_000_000 },
  { value: '1m+', label: '$1M+', min: 1_000_000, max: null },
];

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'newest', label: 'Newest' },
];

const PROMO_LABELS: Record<PromoType, string> = {
  rate_buydown: 'Rate Buydown',
  incentive: 'Incentive',
  event: 'Event',
  broker_bonus: 'Broker Bonus',
  other: 'Other',
};

function priceValueFor(f: InventoryFilterState): string {
  const match = PRICE_OPTS.find(
    (p) => p.min === f.priceMin && p.max === f.priceMax,
  );
  return match ? match.value : '';
}

interface Props {
  rows: BuilderInventoryRow[];
  initialFilters?: InventoryFilterState;
  initialSort?: SortKey;
  /** Which host page rendered this — surfaces in PostHog + analytics. */
  surface?: InventorySurface;
  // When true, the component omits its own <header> (title + lede) — use on
  // pages that already render a page title above it (e.g. /builders hub).
  hideHeader?: boolean;
}

export default function InventoryBrowser({
  rows,
  initialFilters = DEFAULT_FILTERS,
  initialSort = 'featured',
  surface = 'inventory',
  hideHeader = false,
}: Props) {
  const [filters, setFilters] = useState<InventoryFilterState>(initialFilters);
  const [sort, setSort] = useState<SortKey>(initialSort);

  // Distinct filter option sources (derived from the full row set so the
  // menus reflect what's actually available).
  const builderOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.builderName).filter(Boolean))).sort(),
    [rows],
  );
  const cityOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(),
    [rows],
  );
  const promoOptions = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.promoType).filter((p): p is PromoType => !!p)),
      ).sort(),
    [rows],
  );

  const filtered = useMemo(
    () => sortRows(rows.filter((r) => matchesFilter(r, filters)), sort),
    [rows, filters, sort],
  );

  const count = activeFilterCount(filters);

  const track = (filter: string, value: string) =>
    trackEvent('inventory_filter_clicked', { filter, value });

  // Keep the URL in sync (replaceState — no refetch) so the view is
  // shareable and Download-results picks up the current params.
  const syncUrl = (next: InventoryFilterState, nextSort: SortKey) => {
    if (typeof window === 'undefined') return;
    const qs = serializeFilters(next, nextSort);
    const path = window.location.pathname;
    window.history.replaceState({}, '', qs ? `${path}${qs}` : path);
  };

  const update = (patch: Partial<InventoryFilterState>, filter: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      syncUrl(next, sort);
      return next;
    });
    track(filter, value);
  };

  const onBuilder = (v: string) => update({ builder: v || null }, 'builder', v || 'any');
  const onBeds = (v: string) => {
    const n = Number(v) || 0;
    update({ beds: n }, 'beds', n === 0 ? 'any' : `${n}+`);
  };
  const onBaths = (v: string) => {
    const n = Number(v) || 0;
    update({ baths: n }, 'baths', n === 0 ? 'any' : `${n}+`);
  };
  const onPrice = (v: string) => {
    const opt = PRICE_OPTS.find((p) => p.value === v);
    const min = opt?.min ?? null;
    const max = opt?.max ?? null;
    update({ priceMin: min, priceMax: max }, 'price', v || 'any');
  };
  const onCity = (v: string) => update({ city: v || null }, 'city', v || 'any');
  const onPromo = (v: string) =>
    update({ promo: (v || null) as PromoType | null }, 'promo_type', v || 'any');
  const onSort = (v: string) => {
    const nextSort = v as SortKey;
    setSort(nextSort);
    syncUrl(filters, nextSort);
    track('sort', v);
  };

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    syncUrl(DEFAULT_FILTERS, sort);
    track('clear', 'all');
  };

  // On mount: normalize the URL to the (server-forced) kind + fire a page-view
  // event so dedicated-page traffic is tracked in PostHog. Runs once.
  useEffect(() => {
    syncUrl(filters, sort);
    trackEvent('inventory_page_viewed', {
      surface,
      kind: filters.kind ?? 'all',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heading =
    filters.kind === 'listing'
      ? 'Move-in Ready Homes'
      : filters.kind === 'promotion'
        ? 'Promotions'
        : 'Move-in Ready & Promotions';
  const lede =
    filters.kind === 'listing'
      ? 'Move-in ready homes from our builder and developer partners.'
      : filters.kind === 'promotion'
        ? 'Current promotions and incentives from our builder and developer partners.'
        : 'Move-in ready homes and current promotions from our builder and developer partners.';

  return (
    <div>
      {!hideHeader && (
        <header className="mb-4">
          <PageTitle size="md">{heading}</PageTitle>
          <p className="text-sm text-gray-700 font-light leading-relaxed mt-2">
            {lede}
          </p>
        </header>
      )}

      {hideHeader && (
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-semibold mb-2">
          {heading}
        </h2>
      )}

      {/* Compact search bar: one wrapping row of small selects. */}
      <div className="sticky top-0 z-20 -mx-4 px-3 py-2 bg-white/95 backdrop-blur border-b border-gray-200 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterSelect
            label="Builder"
            value={filters.builder ?? ''}
            onChange={onBuilder}
            options={[{ value: '', label: 'All builders' }, ...builderOptions.map((b) => ({ value: b, label: b }))]}
          />
          <FilterSelect
            label="Beds"
            value={String(filters.beds)}
            onChange={onBeds}
            options={BED_BATH_OPTS.map((n) => ({ value: String(n), label: n === 0 ? 'Any' : `${n}+` }))}
          />
          <FilterSelect
            label="Baths"
            value={String(filters.baths)}
            onChange={onBaths}
            options={BED_BATH_OPTS.map((n) => ({ value: String(n), label: n === 0 ? 'Any' : `${n}+` }))}
          />
          <FilterSelect
            label="Price"
            value={priceValueFor(filters)}
            onChange={onPrice}
            options={PRICE_OPTS.map((p) => ({ value: p.value, label: p.label }))}
          />
          {cityOptions.length > 0 && (
            <FilterSelect
              label="City"
              value={filters.city ?? ''}
              onChange={onCity}
              options={[{ value: '', label: 'Any city' }, ...cityOptions.map((c) => ({ value: c, label: c }))]}
            />
          )}
          {promoOptions.length > 0 && (
            <FilterSelect
              label="Promo"
              value={filters.promo ?? ''}
              onChange={onPromo}
              options={[
                { value: '', label: 'Any promo' },
                ...promoOptions.map((p) => ({ value: p, label: PROMO_LABELS[p] })),
              ]}
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">
              {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
            </span>
            <FilterSelect
              label="Sort"
              value={sort}
              onChange={onSort}
              options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
            />
          </div>
        </div>

        {count > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={clearAll}
              className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
            >
              Clear {count} {count === 1 ? 'filter' : 'filters'}
            </button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState hasFilters={count > 0} onClear={clearAll} />
      ) : (
        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {filtered.map((r) => (
            <li key={r.id}>
              <BuilderInventoryRowCard
                row={r}
                variant={r.kind === 'promotion' ? 'promotion' : 'listing'}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Compact labeled select — small text, tight, inline. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none text-[11px] font-medium rounded-md border border-gray-300 bg-white pl-2 pr-5 py-1 text-gray-700 max-w-[42vw] truncate focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  const title = 'No results found';
  const body = hasFilters
    ? 'Try widening your filters or clearing them to see more results.'
    : "There aren't any move-in ready homes or promotions to show right now.";
  return (
    <div className="text-center py-16 px-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">{body}</p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-white"
          style={{ backgroundColor: '#5a0e5f' }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
