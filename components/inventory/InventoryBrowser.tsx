'use client';

// InventoryBrowser — NewHomeSource-style search filters for the
// /inventory directory. Owns ALL filtering client-side so toggling
// Beds / Baths / Price / Builder / City / Promo-type / sort is instant
// (no full page reload). Mirrors the filter dimensions from the
// NewHomeSource community-search UI, restricted to fields the app's
// builder_inventory table actually stores:
//   - Bedrooms / Bathrooms  (beds_max / baths_max)  → segmented "n+"
//   - Price range           (price_min / price_max) → presets + custom min/max
//   - Builder               (builder_name)          → select (hidden when ?builder= scopes the page)
//   - City                  (city)                  → select
//   - Promo type            (promo_type)            → select (promotions only)
//   - Kind                  (listing | promotion)  → top tabs
//   - Sort                  featured / price / newest
// Amenities, 55+, garages, stories, etc. have no backing data column and
// are intentionally omitted (would surface empty filters).
//
// Every filter change fires `inventory_filter_clicked` with
// { filter, value } so the existing admin metrics dashboard
// (filter_usage breakdown by properties.filter) picks it up.

import { useId, useMemo, useState } from 'react';
import type { BuilderInventoryRow, Kind, PromoType } from '@/lib/builder-inventory';
import { trackEvent } from '@/app/posthog-provider';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import PageTitle from '@/components/ui/PageTitle';

type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest';

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

interface FilterState {
  beds: number; // 0 = Any
  baths: number; // 0 = Any
  priceMin: number | null;
  priceMax: number | null;
  builder: string | null;
  city: string | null;
  promo: PromoType | null;
}

const DEFAULT_FILTERS: FilterState = {
  beds: 0,
  baths: 0,
  priceMin: null,
  priceMax: null,
  builder: null,
  city: null,
  promo: null,
};

function matchesFilter(row: BuilderInventoryRow, f: FilterState, kind: Kind): boolean {
  if (row.kind !== kind) return false;
  if (f.beds > 0 && (row.bedsMax == null || row.bedsMax < f.beds)) return false;
  if (f.baths > 0 && (row.bathsMax == null || row.bathsMax < f.baths)) return false;
  if (f.builder && row.builderName !== f.builder) return false;
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

function sortRows(rows: BuilderInventoryRow[], sort: SortKey): BuilderInventoryRow[] {
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

function activeCount(f: FilterState): number {
  return (
    (f.beds > 0 ? 1 : 0) +
    (f.baths > 0 ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.builder ? 1 : 0) +
    (f.city ? 1 : 0) +
    (f.promo ? 1 : 0)
  );
}

interface Props {
  rows: BuilderInventoryRow[];
  initialKind: Kind;
  builder: string | null;
  // When true, the component omits its own <header> (title + lede) — use on
  // pages that already render a page title above it (e.g. /builders hub).
  hideHeader?: boolean;
}

export default function InventoryBrowser({
  rows,
  initialKind,
  builder,
  hideHeader = false,
}: Props) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortKey>('featured');
  const [panelOpen, setPanelOpen] = useState(true);
  const priceId = useId();

  // Distinct filter option sources (derived from the full row set so the
  // menus reflect what's actually available across both kinds).
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
    () => sortRows(rows.filter((r) => matchesFilter(r, filters, kind)), sort),
    [rows, filters, kind, sort],
  );

  const count = activeCount(filters);

  const track = (filter: string, value: string) =>
    trackEvent('inventory_filter_clicked', {
      filter,
      value,
      builder_name: builder ?? null,
      kind,
    });

  const onKind = (k: Kind) => {
    if (k === kind) return;
    setKind(k);
    // Reset promo filter when leaving promotions (it only applies there).
    if (k === 'listing' && filters.promo) {
      setFilters((f) => ({ ...f, promo: null }));
    }
    track('kind', k);
    // Keep the URL shareable without triggering a refetch.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (k === 'listing') url.searchParams.delete('kind');
      else url.searchParams.set('kind', 'promotion');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const onBeds = (n: number) => {
    setFilters((f) => ({ ...f, beds: n }));
    track('beds', n === 0 ? 'any' : `${n}+`);
  };
  const onBaths = (n: number) => {
    setFilters((f) => ({ ...f, baths: n }));
    track('baths', n === 0 ? 'any' : `${n}+`);
  };
  const onBuilder = (v: string) => {
    const val = v || null;
    setFilters((f) => ({ ...f, builder: val }));
    track('builder', v || 'any');
  };
  const onCity = (v: string) => {
    const val = v || null;
    setFilters((f) => ({ ...f, city: val }));
    track('city', v || 'any');
  };
  const onPromo = (v: string) => {
    const val = (v || null) as PromoType | null;
    setFilters((f) => ({ ...f, promo: val }));
    track('promo_type', v || 'any');
  };
  const onPreset = (p: { min: number | null; max: number | null }) => {
    setFilters((f) => ({ ...f, priceMin: p.min, priceMax: p.max }));
    const label =
      p.min == null && p.max == null
        ? 'any'
        : p.max == null
          ? `${fmtMoney(p.min!)}+`
          : p.min == null
            ? `under ${fmtMoney(p.max)}`
            : `${fmtMoney(p.min)}-${fmtMoney(p.max)}`;
    track('price', label);
  };
  const onPriceMin = (raw: string) => {
    const n = parseNum(raw);
    setFilters((f) => ({ ...f, priceMin: n }));
    if (n != null || raw === '') track('price_min', n == null ? 'any' : fmtMoney(n));
  };
  const onPriceMax = (raw: string) => {
    const n = parseNum(raw);
    setFilters((f) => ({ ...f, priceMax: n }));
    if (n != null || raw === '') track('price_max', n == null ? 'any' : fmtMoney(n));
  };
  const onSort = (v: string) => {
    setSort(v as SortKey);
    track('sort', v);
  };

  const clearAll = () => {
    setFilters(DEFAULT_FILTERS);
    track('clear', 'all');
  };

  const heading = kind === 'promotion' ? 'Promotions' : 'Move-in Ready Homes';
  const noun = kind === 'promotion' ? 'promotion' : 'home';

  return (
    <div>
      {!hideHeader && (
        <header className="mb-5">
          {builder && (
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500 font-medium">
              {builder}
            </div>
          )}
          <PageTitle size="md" className={builder ? 'mt-2' : ''}>
            {builder ? `${builder} ${heading}` : heading}
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
            {kind === 'promotion'
              ? builder
                ? `Current promotions from ${builder}.`
                : 'Current incentives, rate buy-downs, and limited-time offers from our builder partners.'
              : builder
                ? `Move-in ready homes available now from ${builder}.`
                : 'Specific homes available now from builder partners.'}
          </p>
        </header>
      )}

      {/* Section label when embedded under a host page's own title. */}
      {hideHeader && (
        <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
          {heading}
        </h2>
      )}

      {/* Kind tabs + Filters button + Sort + count */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-gray-200 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-gray-100 rounded-md p-1">
            <button
              onClick={() => onKind('listing')}
              aria-pressed={kind === 'listing'}
              className="px-3 py-1.5 text-xs uppercase tracking-wider font-semibold rounded-md transition-colors"
              style={
                kind === 'listing'
                  ? { backgroundColor: '#5a0e5f', color: 'white' }
                  : { color: '#6b7280' }
              }
            >
              Move-in Ready
            </button>
            <button
              onClick={() => onKind('promotion')}
              aria-pressed={kind === 'promotion'}
              className="px-3 py-1.5 text-xs uppercase tracking-wider font-semibold rounded-md transition-colors"
              style={
                kind === 'promotion'
                  ? { backgroundColor: '#5a0e5f', color: 'white' }
                  : { color: '#6b7280' }
              }
            >
              Promotions
            </button>
          </div>

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

            {/* Builder / City / Promo selects */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {!builder && builderOptions.length > 0 && (
                <SelectGroup
                  label="Builder"
                  value={filters.builder ?? ''}
                  onChange={onBuilder}
                  options={builderOptions}
                />
              )}
              {cityOptions.length > 0 && (
                <SelectGroup
                  label="City"
                  value={filters.city ?? ''}
                  onChange={onCity}
                  options={cityOptions}
                />
              )}
              {kind === 'promotion' && promoOptions.length > 0 && (
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
        <EmptyState kind={kind} builder={builder} hasFilters={count > 0} onClear={clearAll} />
      ) : (
        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {filtered.map((r) => (
            <li key={r.id}>
              <BuilderInventoryRowCard
                row={r}
                variant={kind === 'promotion' ? 'promotion' : 'listing'}
                hideBuilderName={!!builder}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
  kind,
  builder,
  hasFilters,
  onClear,
}: {
  kind: Kind;
  builder: string | null;
  hasFilters: boolean;
  onClear: () => void;
}) {
  const title =
    kind === 'promotion' ? 'No promotions match' : 'No homes match';
  const body = hasFilters
    ? 'Try widening your filters or clearing them to see more results.'
    : builder
      ? `${builder} doesn't have any ${kind === 'promotion' ? 'active promotions' : 'move-in ready homes'} listed right now.`
      : `There aren't any ${kind === 'promotion' ? 'active builder promotions' : 'move-in ready builder homes'} to show right now.`;
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
