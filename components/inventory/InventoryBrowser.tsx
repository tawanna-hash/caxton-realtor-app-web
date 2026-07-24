'use client';

// InventoryBrowser — NewHomeSource-style search filters for the
// /inventory and /builders directories. Owns ALL filtering client-side so
// toggling Beds / Baths / Price / Builder / City / Promo-type / sort is
// instant (no full page reload).
//
// Filter state is seeded from the URL (parsed server-side by the host page
// and passed in as initialFilters/initialSort — keeps SSR + hydration in
// sync) and synced back to the URL via history.replaceState on every
// change. That makes a filtered view shareable and lets the floater's
// Download-results button append the same params to the PDF endpoint.
//
// Filter dimensions (restricted to fields builder_inventory stores):
//   - Builder               (builder_name)          → dropdown in the sticky bar
//   - Bedrooms / Bathrooms  (beds_max / baths_max)  → segmented "n+"
//   - Price range           (price_min / price_max) → presets + custom min/max
//   - City                  (city)                  → select
//   - Promo type            (promo_type)            → select
//   - Sort                  featured / price / newest
// Listings and promotions are shown together; each card renders by its own
// row.kind. The matching/filtering/sorting logic lives in
// @/lib/inventory-filters and is shared with /api/inventory/pdf.
//
// Every filter change fires `inventory_filter_clicked` with { filter, value }
// so the existing admin metrics dashboard (filter_usage breakdown by
// properties.filter) picks it up.

import { useId, useMemo, useState } from 'react';
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

const BED_BATH_OPTS = [0, 1, 2, 3, 4, 5];

const PRICE_PRESETS: { label: string; min: number | null; max: number | null }[] = [
  { label: 'Any', min: null, max: null },
  { label: 'Under $400k', min: null, max: 399_999 },
  { label: '$400k–$600k', min: 400_000, max: 600_000 },
  { label: '$600k–$800k', min: 600_000, max: 800_000 },
  { label: '$800k–$1M', min: 800_000, max: 1_000_000 },
  { label: '$1M+', min: 1_000_000, max: null },
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

function fmtMoney(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}k`;
}

function dollarInput(n: number | null): string {
  return n == null ? '' : String(n);
}

function parseNum(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

interface Props {
  rows: BuilderInventoryRow[];
  initialFilters?: InventoryFilterState;
  initialSort?: SortKey;
  // When true, the component omits its own <header> (title + lede) — use on
  // pages that already render a page title above it (e.g. /builders hub).
  hideHeader?: boolean;
}

export default function InventoryBrowser({
  rows,
  initialFilters = DEFAULT_FILTERS,
  initialSort = 'featured',
  hideHeader = false,
}: Props) {
  const [filters, setFilters] = useState<InventoryFilterState>(initialFilters);
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [panelOpen, setPanelOpen] = useState(true);
  const priceId = useId();

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
  const onBeds = (n: number) => update({ beds: n }, 'beds', n === 0 ? 'any' : `${n}+`);
  const onBaths = (n: number) => update({ baths: n }, 'baths', n === 0 ? 'any' : `${n}+`);
  const onCity = (v: string) => update({ city: v || null }, 'city', v || 'any');
  const onPromo = (v: string) =>
    update({ promo: (v || null) as PromoType | null }, 'promo_type', v || 'any');

  const onPreset = (p: { min: number | null; max: number | null }) => {
    update({ priceMin: p.min, priceMax: p.max }, 'price', presetLabel(p));
  };
  const onPriceMin = (raw: string) => {
    const n = parseNum(raw);
    if (n != null || raw === '') {
      update({ priceMin: n }, 'price_min', n == null ? 'any' : fmtMoney(n));
    } else {
      setFilters((prev) => ({ ...prev, priceMin: n }));
    }
  };
  const onPriceMax = (raw: string) => {
    const n = parseNum(raw);
    if (n != null || raw === '') {
      update({ priceMax: n }, 'price_max', n == null ? 'any' : fmtMoney(n));
    } else {
      setFilters((prev) => ({ ...prev, priceMax: n }));
    }
  };
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

  const heading = 'Move-in Ready & Promotions';
  const noun = 'listing';

  return (
    <div>
      {!hideHeader && (
        <header className="mb-5">
          <PageTitle size="md">{heading}</PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
            Move-in ready homes and current promotions from our builder partners.
          </p>
        </header>
      )}

      {/* Section label when embedded under a host page's own title. */}
      {hideHeader && (
        <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
          {heading}
        </h2>
      )}

      {/* Builder dropdown + Filters button + Sort + count */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-gray-200 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filters.builder ?? ''}
            onChange={(e) => onBuilder(e.target.value)}
            aria-label="Builder"
            className="text-xs font-medium rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 max-w-[45vw] truncate focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All builders</option>
            {builderOptions.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          <button
            onClick={() => setPanelOpen((o) => !o)}
            aria-expanded={panelOpen}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md border transition-colors"
            style={
              panelOpen || count > 0
                ? { backgroundColor: '#5a0e5f', color: 'white', borderColor: '#5a0e5f' }
                : { color: '#374151', borderColor: '#d1d5db', backgroundColor: 'white' }
            }
          >
            Filters
            {count > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-white text-brand-700">
                {count}
              </span>
            )}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">
              {filtered.length} {filtered.length === 1 ? noun : `${noun}s`}
            </span>
            <select
              value={sort}
              onChange={(e) => onSort(e.target.value)}
              aria-label="Sort"
              className="text-xs font-medium rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter panel */}
        {panelOpen && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-4">
            {/* Beds + Baths */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FilterGroup label="Bedrooms">
                <Segmented
                  options={BED_BATH_OPTS}
                  value={filters.beds}
                  onSelect={onBeds}
                  format={(n) => (n === 0 ? 'Any' : `${n}+`)}
                />
              </FilterGroup>
              <FilterGroup label="Bathrooms">
                <Segmented
                  options={BED_BATH_OPTS}
                  value={filters.baths}
                  onSelect={onBaths}
                  format={(n) => (n === 0 ? 'Any' : `${n}+`)}
                />
              </FilterGroup>
            </div>

            {/* Price */}
            <FilterGroup label="Price">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {PRICE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => onPreset(p)}
                    className="px-2.5 py-1 text-xs font-medium rounded-md border transition-colors"
                    style={{
                      backgroundColor: 'white',
                      color: '#374151',
                      borderColor: '#d1d5db',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <PriceInput
                  id={`${priceId}-min`}
                  label="Min"
                  value={dollarInput(filters.priceMin)}
                  onChange={onPriceMin}
                />
                <span className="text-gray-400 text-xs">–</span>
                <PriceInput
                  id={`${priceId}-max`}
                  label="Max"
                  value={dollarInput(filters.priceMax)}
                  onChange={onPriceMax}
                />
              </div>
            </FilterGroup>

            {/* City / Promo selects */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cityOptions.length > 0 && (
                <SelectGroup
                  label="City"
                  value={filters.city ?? ''}
                  onChange={onCity}
                  options={cityOptions}
                />
              )}
              {promoOptions.length > 0 && (
                <SelectGroup
                  label="Promo type"
                  value={filters.promo ?? ''}
                  onChange={onPromo}
                  options={promoOptions.map((p) => ({ value: p, label: PROMO_LABELS[p] }))}
                />
              )}
            </div>

            {count > 0 && (
              <button
                onClick={clearAll}
                className="text-xs font-semibold uppercase tracking-wider text-brand-700 hover:text-brand-800"
              >
                Clear all filters
              </button>
            )}
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

function presetLabel(p: { min: number | null; max: number | null }): string {
  if (p.min == null && p.max == null) return 'any';
  if (p.max == null) return `${fmtMoney(p.min!)}+`;
  if (p.min == null) return `under ${fmtMoney(p.max)}`;
  return `${fmtMoney(p.min)}-${fmtMoney(p.max)}`;
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}

function Segmented({
  options,
  value,
  onSelect,
  format,
}: {
  options: number[];
  value: number;
  onSelect: (n: number) => void;
  format: (n: number) => string;
}) {
  return (
    <div className="inline-flex flex-wrap bg-gray-100 rounded-md p-1 gap-0.5">
      {options.map((n) => {
        const active = n === value;
        return (
          <button
            key={n}
            onClick={() => onSelect(n)}
            aria-pressed={active}
            className="px-2.5 py-1 text-xs font-semibold rounded-md transition-colors"
            style={
              active
                ? { backgroundColor: '#5a0e5f', color: 'white' }
                : { color: '#6b7280' }
            }
          >
            {format(n)}
          </button>
        );
      })}
    </div>
  );
}

function PriceInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex-1">
      <label htmlFor={id} className="sr-only">
        {label} price
      </label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          placeholder={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-5 pr-2 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}

function SelectGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: (string | { value: string; label: string })[];
}) {
  const opts = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs font-medium rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        <option value="">Any</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  const title = 'No listings match';
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
