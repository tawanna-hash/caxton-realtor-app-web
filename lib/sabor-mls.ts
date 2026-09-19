// lib/sabor-mls.ts
//
// Shared types + English/Spanish label presets for the monthly SABOR
// MLS Summary Report. Used by:
//   - /api/admin/sabor-mls (validation + persistence)
//   - /api/sabor-mls/current (read-through to the public card)
//   - /admin/content/saborreport (admin editor)
//   - components/SaborReportCard.tsx (public render)
//
// The schema mirrors the actual SABOR monthly infographic so the editor
// only ever needs to type numbers. Each field carries an English label
// plus an optional Spanish label, since SA readers expect both.

export type DeltaDirection = 'up' | 'down' | 'flat';

/**
 * A single numbered indicator (e.g. "Days on Market 83 ↑15%").
 * delta + delta_direction are optional — some stats on the SABOR
 * infographic publish without YoY deltas (Months of Inventory,
 * Average Residential Rental, Close to Original List Price).
 */
export interface IndicatorStat {
  /** Stable key — never shown, used to identify the stat across
   *  months when the editor pre-fills labels. */
  key: string;
  label_en: string;
  label_es: string;
  value: string;                 // pre-formatted, e.g. "$306,000"
  delta?: string;                // e.g. "1%" — without arrow glyph
  delta_direction?: DeltaDirection;
}

/** A listing-count stat (4 of these on the SABOR card). */
export interface ListingCount {
  key: string;
  label_en: string;
  label_es: string;
  value: string;
  delta?: string;
  delta_direction?: DeltaDirection;
}

/** A price-band sales-share entry (4 of these). */
export interface PriceBand {
  key: string;
  label_en: string;              // "$200,000 - $499,999" — no translation needed for bands
  label_es: string;              // mirrors English; provided so future formatting changes route through one place
  share: string;                 // e.g. "66.30%"
}

/** Complete report payload. */
export interface SaborReport {
  month_label: string;           // "May 2026"
  month_label_es: string;        // "Mayo 2026"
  released_at: string;           // ISO date
  /** Subtitle below the title, both languages. */
  subtitle_en: string;           // "San Antonio market indicators..." or PDF disclaimer
  subtitle_es: string;
  /** Big headline number on the card. */
  headline_value: string;
  headline_delta: string;        // "4%" (no glyph)
  headline_delta_direction: DeltaDirection;
  headline_label_en: string;
  headline_label_es: string;
  /** 8 indicator stats (Days on Market, Price/SqFt, etc.). */
  indicator_stats: IndicatorStat[];
  /** 4 listing-count stats. */
  listing_counts: ListingCount[];
  /** 4 price-band shares. */
  price_bands: PriceBand[];
  page_count?: number | null;
  pdf_storage_key?: string | null;
}

// ---------------------------------------------------------------------------
// Preset labels straight from the SABOR May 2026 Market Stats infographic.
// The admin "Pre-fill labels" button populates these so the editor just
// types the month's numbers.
// ---------------------------------------------------------------------------

export const INDICATOR_PRESETS: Array<Omit<IndicatorStat, 'value' | 'delta' | 'delta_direction'>> = [
  { key: 'days_on_market',          label_en: 'Days on Market',           label_es: 'Dias en el Mercado' },
  { key: 'price_per_sqft',          label_en: 'Price per Square Foot',    label_es: 'Precio por Pie Cuadrado' },
  { key: 'close_to_list_price',     label_en: 'Close to Original List Price', label_es: 'Cerca al Precio Original de Lista' },
  { key: 'months_of_inventory',     label_en: 'Months of Inventory',      label_es: 'Meses de Inventario' },
  { key: 'avg_residential_rental',  label_en: 'Average Residential Rental', label_es: 'Alquiler Residencial Promedio' },
  { key: 'total_sales',             label_en: 'Total Sales',              label_es: 'Ventas Totales' },
  { key: 'average_price',           label_en: 'Average Price',            label_es: 'Precio Promedio' },
  { key: 'median_price',            label_en: 'Median Price',             label_es: 'Precio Mediano' },
];

export const LISTING_COUNT_PRESETS: Array<Omit<ListingCount, 'value' | 'delta' | 'delta_direction'>> = [
  { key: 'new_listings',                    label_en: 'New Listings',                       label_es: 'Listados Nuevos' },
  { key: 'active_listings',                 label_en: 'Active Listings',                    label_es: 'Listados Activos' },
  { key: 'pending_listings',                label_en: 'Pending Listings',                   label_es: 'Listados Pendientes' },
  { key: 'active_residential_rental_list',  label_en: 'Active Residential Rental Listings', label_es: 'Listados de Alquiler Residencial Activos' },
];

export const PRICE_BAND_PRESETS: Array<Omit<PriceBand, 'share'>> = [
  { key: 'band_0_199',     label_en: '$0 - $199,999',       label_es: '$0 - $199,999' },
  { key: 'band_200_499',   label_en: '$200,000 - $499,999', label_es: '$200,000 - $499,999' },
  { key: 'band_500_749',   label_en: '$500,000 - $749,999', label_es: '$500,000 - $749,999' },
  { key: 'band_750_plus',  label_en: '$750,000 - 1M+',      label_es: '$750,000 - 1M+' },
];

export const DEFAULT_SUBTITLE_EN =
  'Percent change reflects a year-over-year comparison. San Antonio market indicators across single-family, multifamily, rental and commercial segments.';
export const DEFAULT_SUBTITLE_ES =
  'El cambio porcentual refleja una comparacion ano tras ano. Indicadores del mercado de San Antonio en los segmentos residencial, multifamiliar, alquiler y comercial.';

export const DEFAULT_HEADLINE_LABEL_EN = 'Closed dollar volume \u00b7 single family \u00b7 YoY';
export const DEFAULT_HEADLINE_LABEL_ES = 'Volumen total cerrado \u00b7 unifamiliar \u00b7 ano tras ano';

// ---------------------------------------------------------------------------
// Spanish month names — used by the admin "Pre-fill" button to derive
// month_label_es from the English month label.
// ---------------------------------------------------------------------------

const MONTHS_EN_TO_ES: Record<string, string> = {
  January: 'Enero', February: 'Febrero', March: 'Marzo', April: 'Abril',
  May: 'Mayo', June: 'Junio', July: 'Julio', August: 'Agosto',
  September: 'Septiembre', October: 'Octubre', November: 'Noviembre', December: 'Diciembre',
};

export function translateMonthLabel(en: string): string {
  // "May 2026" -> "Mayo 2026"
  const m = en.trim().match(/^(\w+)\s+(\d{4})$/);
  if (!m) return en;
  const es = MONTHS_EN_TO_ES[m[1]];
  return es ? `${es} ${m[2]}` : en;
}

/**
 * Build a blank report skeleton with EN+ES preset labels populated and
 * all numeric values empty. Used by both the admin form's "Pre-fill
 * labels" button and the public card's empty-state fallback.
 */
export function makeBlankReport(month_label = '', released_at = ''): SaborReport {
  return {
    month_label,
    month_label_es: translateMonthLabel(month_label),
    released_at,
    subtitle_en: DEFAULT_SUBTITLE_EN,
    subtitle_es: DEFAULT_SUBTITLE_ES,
    headline_value: '',
    headline_delta: '',
    headline_delta_direction: 'up',
    headline_label_en: DEFAULT_HEADLINE_LABEL_EN,
    headline_label_es: DEFAULT_HEADLINE_LABEL_ES,
    indicator_stats: INDICATOR_PRESETS.map((p) => ({ ...p, value: '' })),
    listing_counts: LISTING_COUNT_PRESETS.map((p) => ({ ...p, value: '' })),
    price_bands: PRICE_BAND_PRESETS.map((p) => ({ ...p, share: '' })),
    page_count: null,
    pdf_storage_key: null,
  };
}

/**
 * Backward-compatibility shim: convert a legacy report row (the older
 * { headline_*, mini_stats[4] } shape) into the new SaborReport. Used
 * by the public API so cards keep rendering for any report row created
 * before the v2 schema landed.
 */
interface LegacyMiniStat { value: string; label: string }
export interface LegacyReport {
  month_label: string;
  released_at: string;
  headline_value: string;
  headline_delta: string;
  headline_delta_direction: DeltaDirection;
  headline_label: string;
  mini_stats: LegacyMiniStat[];
  page_count?: number | null;
}

export function legacyToReport(r: LegacyReport): SaborReport {
  const base = makeBlankReport(r.month_label, r.released_at);
  return {
    ...base,
    headline_value: r.headline_value,
    headline_delta: r.headline_delta.replace(/[\u25B2\u25BC\u2191\u2193\u2190\u2192\s]/g, ''),
    headline_delta_direction: r.headline_delta_direction,
    headline_label_en: r.headline_label || base.headline_label_en,
    // Replace the first 4 indicator stats with the legacy mini_stats so
    // the legacy April-2026 row still renders something on the new card.
    indicator_stats: base.indicator_stats.map((p, i) => {
      const m = r.mini_stats[i];
      if (!m) return p;
      return { ...p, label_en: m.label || p.label_en, value: m.value || '' };
    }),
    page_count: r.page_count ?? null,
  };
}
