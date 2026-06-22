'use client';

/**
 * SaborReportCard
 * ─────────────────────────────────────────────────────────────────────────
 * Public CTA card for the monthly SABOR MLS Summary Report. Renders the
 * full SABOR infographic shape: headline number, 8 indicator stats, 4
 * listing counts, 4 price bands. Toggles between English and Spanish.
 *
 * Two variants:
 *   - variant="hero"    → Pinned at top of the Newsline San Antonio feed for the first 7
 *                        days after release. No-shadow flat treatment.
 *   - variant="inline"  → Same component, slipped between articles.
 *
 * Data: GET /api/sabor-mls/current populates the card. Falls back to a
 * baked-in May 2026 SA Market Stats snapshot if the API hasn't been
 * seeded yet (matches the printed PDF).
 */

import { useEffect, useMemo, useState } from 'react';
import type { SaborReport, DeltaDirection } from '@/lib/sabor-mls';

interface Props {
  variant?: 'hero' | 'inline';
}

const NEWSLINE = '#301D5D';

// Baked-in May 2026 SA Market Stats — used when the API returns no row.
// Spanish strings use ASCII (no accents) to avoid pre-commit lint snags.
const FALLBACK: SaborReport = {
  month_label: 'May 2026',
  month_label_es: 'Mayo 2026',
  released_at: '2026-06-07',
  subtitle_en:
    'Percent change reflects a year-over-year comparison. San Antonio market indicators across single-family, multifamily, rental and commercial segments.',
  subtitle_es:
    'El cambio porcentual refleja una comparacion ano tras ano. Indicadores del mercado de San Antonio en los segmentos residencial, multifamiliar, alquiler y comercial.',
  headline_value: '$1.38B',
  headline_delta: '8%',
  headline_delta_direction: 'up',
  headline_label_en: 'Closed dollar volume \u00b7 single family \u00b7 YoY',
  headline_label_es: 'Volumen total cerrado \u00b7 unifamiliar \u00b7 ano tras ano',
  indicator_stats: [
    { key: 'days_on_market',         label_en: 'Days on Market',           label_es: 'Dias en el Mercado',          value: '83',       delta: '15%', delta_direction: 'up' },
    { key: 'price_per_sqft',         label_en: 'Price per Square Foot',    label_es: 'Precio por Pie Cuadrado',     value: '$171',     delta: '1%',  delta_direction: 'down' },
    { key: 'close_to_list_price',    label_en: 'Close to Original List Price', label_es: 'Cerca al Precio Original de Lista', value: '92.7%' },
    { key: 'months_of_inventory',    label_en: 'Months of Inventory',      label_es: 'Meses de Inventario',         value: '6.14' },
    { key: 'avg_residential_rental', label_en: 'Average Residential Rental', label_es: 'Alquiler Residencial Promedio', value: '$1,863' },
    { key: 'total_sales',            label_en: 'Total Sales',              label_es: 'Ventas Totales',              value: '3,637',    delta: '5%',  delta_direction: 'up' },
    { key: 'average_price',          label_en: 'Average Price',            label_es: 'Precio Promedio',             value: '$379,697', delta: '3%',  delta_direction: 'up' },
    { key: 'median_price',           label_en: 'Median Price',             label_es: 'Precio Mediano',              value: '$306,000', delta: '1%',  delta_direction: 'down' },
  ],
  listing_counts: [
    { key: 'new_listings',                   label_en: 'New Listings',     label_es: 'Listados Nuevos',     value: '5,101',  delta: '10%', delta_direction: 'down' },
    { key: 'active_listings',                label_en: 'Active Listings',  label_es: 'Listados Activos',    value: '17,211', delta: '6%',  delta_direction: 'up' },
    { key: 'pending_listings',               label_en: 'Pending Listings', label_es: 'Listados Pendientes', value: '3,050',  delta: '3%',  delta_direction: 'down' },
    { key: 'active_residential_rental_list', label_en: 'Active Residential Rental Listings', label_es: 'Listados de Alquiler Residencial Activos', value: '4,463', delta: '9%', delta_direction: 'up' },
  ],
  price_bands: [
    { key: 'band_0_199',    label_en: '$0 - $199,999',       label_es: '$0 - $199,999',       share: '15.48%' },
    { key: 'band_200_499',  label_en: '$200,000 - $499,999', label_es: '$200,000 - $499,999', share: '66.30%' },
    { key: 'band_500_749',  label_en: '$500,000 - $749,999', label_es: '$500,000 - $749,999', share: '11.63%' },
    { key: 'band_750_plus', label_en: '$750,000 - 1M+',      label_es: '$750,000 - 1M+',      share: '6.59%' },
  ],
  page_count: null,
};

function dirGlyph(d: DeltaDirection | undefined): string {
  if (d === 'up') return '\u25B2';      // ▲
  if (d === 'down') return '\u25BC';    // ▼
  if (d === 'flat') return '\u2014';    // —
  return '';
}

function dirColor(d: DeltaDirection | undefined): string {
  if (d === 'down') return '#b91c1c';
  if (d === 'flat') return '#6b7280';
  if (d === 'up') return '#16a34a';
  return '#6b7280';
}

export default function SaborReportCard({ variant = 'inline' }: Props) {
  const [data, setData] = useState<SaborReport | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');

  useEffect(() => {
    let alive = true;
    fetch('/api/sabor-mls/current', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j && j.ok && j.report) setData(j.report as SaborReport);
        else setData(FALLBACK);
      })
      .catch(() => {
        if (alive) setData(FALLBACK);
      });
    return () => {
      alive = false;
    };
  }, []);

  const d = data ?? FALLBACK;

  const monthLabel = lang === 'es' ? d.month_label_es : d.month_label;
  const subtitle = lang === 'es' ? d.subtitle_es : d.subtitle_en;
  const headlineLabel = lang === 'es' ? d.headline_label_es : d.headline_label_en;
  const summaryWord = lang === 'es' ? 'Resumen MLS' : 'MLS Summary';
  const sectionLabels = useMemo(
    () =>
      lang === 'es'
        ? { listings: 'Listados', priceBands: 'Por rango de precio (% de ventas)', members: 'Los miembros de SABOR pueden', signInLink: 'iniciar sesion para descargar el informe completo' }
        : { listings: 'Listings', priceBands: 'By price band (share of sales)', members: 'SABOR members can', signInLink: 'sign in to download the full Market Stats report' },
    [lang],
  );

  function trackImpression() {
    try {
      const w = window as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } };
      w.posthog?.capture?.('sabor_mls_card_view', { variant, month: d.month_label });
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    const el = document.getElementById(`sabor-card-${variant}`);
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          trackImpression();
          obs.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, d.month_label]);

  const headlineColor = dirColor(d.headline_delta_direction);

  return (
    <article
      id={`sabor-card-${variant}`}
      className="bg-white border-b border-gray-200"
      aria-label={`SABOR MLS Summary Report ${d.month_label}`}
    >
      <div className="bg-white mx-3 my-3 rounded-md overflow-hidden shadow-sm">
        {/* Brand top strip */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${NEWSLINE} 0%, #7a1f7e 100%)` }} />

        <div className="px-4 pt-4 pb-4">
          {/* Eyebrow row + EN/ES toggle */}
          <div className="flex items-center justify-between mb-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ background: 'rgba(61,7,64,0.06)', color: NEWSLINE }}
            >
              <span aria-hidden>{'\u25CF'}</span>
              <span>SABOR Report</span>
            </span>
            <div className="inline-flex items-center rounded-full p-0.5" style={{ background: 'rgba(48,29,93,0.08)' }}>
              <button
                type="button"
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase transition"
                style={{
                  background: lang === 'en' ? NEWSLINE : 'transparent',
                  color: lang === 'en' ? 'white' : NEWSLINE,
                }}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('es')}
                aria-pressed={lang === 'es'}
                className="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase transition"
                style={{
                  background: lang === 'es' ? NEWSLINE : 'transparent',
                  color: lang === 'es' ? 'white' : NEWSLINE,
                }}
              >
                ES
              </button>
            </div>
          </div>

          {/* Title */}
          <h3 className="text-[20px] leading-tight font-bold text-gray-900 mb-1">
            {monthLabel} {summaryWord}
          </h3>
          <p className="text-[13px] text-gray-500 leading-snug mb-4">{subtitle}</p>

          {/* Hero stat */}
          <div className="flex items-baseline gap-2.5">
            <div className="text-[38px] font-bold leading-none" style={{ color: '#2c0530' }}>
              {d.headline_value}
            </div>
            {d.headline_delta && (
              <div className="text-[13px] font-bold" style={{ color: headlineColor }}>
                {dirGlyph(d.headline_delta_direction)} {d.headline_delta}
              </div>
            )}
          </div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500 mt-1.5 mb-3.5">
            {headlineLabel}
          </div>

          {/* Indicator stats — 8, 2 cols mobile / 4 cols desktop */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3 py-3 mb-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {d.indicator_stats.map((s) => (
              <div key={s.key || s.label_en}>
                <div className="flex items-baseline gap-1">
                  <div className="text-[15px] font-bold text-gray-900 leading-tight">{s.value}</div>
                  {s.delta && (
                    <div className="text-[10px] font-bold" style={{ color: dirColor(s.delta_direction) }}>
                      {dirGlyph(s.delta_direction)} {s.delta}
                    </div>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-[0.10em] text-gray-500 mt-0.5 leading-tight">
                  {lang === 'es' ? s.label_es : s.label_en}
                </div>
              </div>
            ))}
          </div>

          {/* Listing counts */}
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-500 mb-2">
            {sectionLabels.listings}
          </p>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3 py-3 mb-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {d.listing_counts.map((s) => (
              <div key={s.key || s.label_en}>
                <div className="flex items-baseline gap-1">
                  <div className="text-[15px] font-bold text-gray-900 leading-tight">{s.value}</div>
                  {s.delta && (
                    <div className="text-[10px] font-bold" style={{ color: dirColor(s.delta_direction) }}>
                      {dirGlyph(s.delta_direction)} {s.delta}
                    </div>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-[0.10em] text-gray-500 mt-0.5 leading-tight">
                  {lang === 'es' ? s.label_es : s.label_en}
                </div>
              </div>
            ))}
          </div>

          {/* Price bands */}
          <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-gray-500 mb-2">
            {sectionLabels.priceBands}
          </p>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-3 py-3 mb-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {d.price_bands.map((b) => (
              <div key={b.key || b.label_en}>
                <div className="text-[15px] font-bold text-gray-900 leading-tight">{b.share}</div>
                <div className="text-[10px] uppercase tracking-[0.10em] text-gray-500 mt-0.5 leading-tight">
                  {lang === 'es' ? b.label_es : b.label_en}
                </div>
              </div>
            ))}
          </div>

          {/* Member disclaimer / deep-link */}
          <p
            className="text-[11px] leading-snug text-gray-500 pt-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {sectionLabels.members}{' '}
            <a
              href="https://sabor.mysolidearth.com/authenticate"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-medium"
              style={{ color: NEWSLINE }}
            >
              {sectionLabels.signInLink}
            </a>
            .
          </p>
        </div>
      </div>
    </article>
  );
}
