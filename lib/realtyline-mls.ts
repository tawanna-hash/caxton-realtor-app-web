// lib/realtyline-mls.ts
//
// Shared types + English/Spanish label presets for the monthly RealtyLine
// (Austin / ABoR — Austin Board of Realtors) MLS Summary Report. Mirrors
// lib/sabor-mls.ts so the admin editor + public card share the same shape
// across both publications.
//
// Used by:
//   - /api/admin/realtyline-mls           (validation + persistence)
//   - /api/realtyline-mls/current         (read-through to the public card)
//   - /admin/content/realtylinereport     (admin editor)
//   - components/RealtyLineReportCard.tsx (public render)
//
// The schema mirrors the actual ABoR monthly "Central Texas Housing Market
// Report" so the editor only ever needs to type numbers. Each field carries
// an English label plus an optional Spanish label so the public card can
// toggle between languages (same UX as SABOR).

export type DeltaDirection = 'up' | 'down' | 'flat';

/**
 * A single numbered indicator (e.g. "Closed Sales 2,953 ↑3.4%").
 * delta + delta_direction are optional — some stats publish without YoY
 * deltas (Average Close to List Price prints a comparison, not a delta).
 */
export interface IndicatorStat {
  /** Stable key — never shown, used to identify the stat across months
   *  when the editor pre-fills labels. */
  key: string;
  label_en: string;
  label_es: string;
  value: string;                 // pre-formatted, e.g. "$440,000"
  delta?: string;                // e.g. "3.4%" — without arrow glyph
  delta_direction?: DeltaDirection;
}

/** A listing-count stat (kept for parity with SABOR; ABoR rolls these
 *  into the main indicators so the admin can leave this empty). */
export interface ListingCount {
  key: string;
  label_en: string;
  label_es: string;
  value: string;
  delta?: string;
  delta_direction?: DeltaDirection;
}

/** A price-band sales-share entry (kept for parity with SABOR; ABoR
 *  publishes this in a separate quarterly piece, so this is optional). */
export interface PriceBand {
  key: string;
  label_en: string;
  label_es: string;
  share: string;                 // e.g. "12.40%"
}

/** Complete report payload. */
export interface RealtyLineReport {
  month_label: string;           // "May 2026"
  month_label_es: string;        // "Mayo 2026"
  released_at: string;           // ISO date
  /** Subtitle below the title, both languages. */
  subtitle_en: string;
  subtitle_es: string;
  /** Big headline number on the card. */
  headline_value: string;
  headline_delta: string;        // "2.2%" (no glyph)
  headline_delta_direction: DeltaDirection;
  headline_label_en: string;
  headline_label_es: string;
  /** 9 indicator stats from the ABoR infographic. */
  indicator_stats: IndicatorStat[];
  /** Optional listing-count stats (kept for parity with SABOR shape). */
  listing_counts: ListingCount[];
  /** Optional price-band shares (kept for parity with SABOR shape). */
  price_bands: PriceBand[];
  page_count?: number | null;
  pdf_storage_key?: string | null;
}

// ---------------------------------------------------------------------------
// Preset labels straight from the ABoR May 2026 Central Texas Housing Market
// Report infographic (9 stats, 3 rows x 3 cols). The admin "Pre-fill labels"
// button populates these so the editor just types the month's numbers.
// ---------------------------------------------------------------------------

export const INDICATOR_PRESETS: Array<Omit<IndicatorStat, 'value' | 'delta' | 'delta_direction'>> = [
  // Row 1
  { key: 'median_sales_price',     label_en: 'Median Sales Price',         label_es: 'Precio Mediano de Venta' },
  { key: 'closed_sales',           label_en: 'Closed Sales',               label_es: 'Ventas Cerradas' },
  { key: 'new_listings',           label_en: 'New Listings',               label_es: 'Listados Nuevos' },
  // Row 2
  { key: 'months_of_inventory',    label_en: 'Months of Inventory',        label_es: 'Meses de Inventario' },
  { key: 'active_listings',        label_en: 'Active Listings',            label_es: 'Listados Activos' },
  { key: 'pending_sales',          label_en: 'Pending Sales',              label_es: 'Ventas Pendientes' },
  // Row 3
  { key: 'sales_dollar_volume',    label_en: 'Sales Dollar Volume',        label_es: 'Volumen Total de Ventas' },
  { key: 'avg_days_on_market',     label_en: 'Average Days on Market',     label_es: 'Dias Promedio en el Mercado' },
  { key: 'avg_close_to_list',      label_en: 'Average Close to List Price', label_es: 'Cerca al Precio de Lista' },
];

/**
 * ABoR doesn't publish a 4-up Listings panel like SABOR, so we leave these
 * empty by default. Admin can still populate them if a future infographic
 * splits them out — keeps the schema identical to SABOR.
 */
export const LISTING_COUNT_PRESETS: Array<Omit<ListingCount, 'value' | 'delta' | 'delta_direction'>> = [];

/**
 * ABoR's price-band breakdown is a separate quarterly piece, so we leave
 * these empty by default for parity with the SABOR shape.
 */
export const PRICE_BAND_PRESETS: Array<Omit<PriceBand, 'share'>> = [];

export const DEFAULT_SUBTITLE_EN =
  'Percent change reflects a year-over-year comparison. Central Texas (Austin-Round Rock-Georgetown MSA) market indicators across single-family, multifamily, rental and commercial segments.';
export const DEFAULT_SUBTITLE_ES =
  'El cambio porcentual refleja una comparacion ano tras ano. Indicadores del mercado del centro de Texas (area metropolitana Austin-Round Rock-Georgetown) en los segmentos residencial, multifamiliar, alquiler y comercial.';

export const DEFAULT_HEADLINE_LABEL_EN = 'Sales dollar volume \u00b7 single family \u00b7 YoY';
export const DEFAULT_HEADLINE_LABEL_ES = 'Volumen total de ventas \u00b7 unifamiliar \u00b7 ano tras ano';

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
export function makeBlankReport(month_label = '', released_at = ''): RealtyLineReport {
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
