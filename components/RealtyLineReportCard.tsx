'use client';

/**
 * RealtyLineReportCard
 * ─────────────────────────────────────────────────────────────────────────
 * Public CTA card for the monthly ABoR (Austin Board of Realtors) "Central
 * Texas Housing Market Report". Renders the full ABoR infographic shape:
 * headline number + 9 indicator stats. Optional listing-counts and
 * price-band sections render only if the admin populated them. Toggles
 * between English and Spanish.
 *
 * Two variants:
 *   - variant="hero"    → Pinned at top of the RealtyLine Austin feed for
 *                        the first 7 days after release. No-shadow flat
 *                        treatment.
 *   - variant="inline"  → Same component, slipped between articles.
 *
 * Data: GET /api/realtyline-mls/current populates the card. Falls back to
 * a baked-in May 2026 ABoR Central Texas Housing snapshot if the API
 * hasn't been seeded yet (matches the printed PDF).
 */

import { useEffect, useMemo, useState } from 'react';
import type { RealtyLineReport, DeltaDirection } from '@/lib/realtyline-mls';

interface Props {
  variant?: 'hero' | 'inline';
}

const NEWSLINE = '#301D5D';

// Baked-in May 2026 ABoR Central Texas Housing Market Report — used when
// the API returns no row. Spanish strings use ASCII (no accents) to avoid
// pre-commit lint snags. Numbers transcribed from the official infographic.
const FALLBACK: RealtyLineReport = {
  month_label: 'May 2026',
  month_label_es: 'Mayo 2026',
  released_at: '2026-06-12',
  subtitle_en:
    'Percent change reflects a year-over-year comparison. Central Texas (Austin-Round Rock-Georgetown MSA) market indicators across single-family, multifamily, rental and commercial segments.',
  subtitle_es:
    'El cambio porcentual refleja una comparacion ano tras ano. Indicadores del mercado del centro de Texas (area metropolitana Austin-Round Rock-Georgetown) en los segmentos residencial, multifamiliar, alquiler y comercial.',
  headline_value: '$1.74B',
  headline_delta: '2.2%',
  headline_delta_direction: 'down',
  headline_label_en: 'Sales dollar volume \u00b7 single family \u00b7 YoY',
  headline_label_es: 'Volumen total de ventas \u00b7 unifamiliar \u00b7 ano tras ano',
  indicator_stats: [
    { key: 'median_sales_price',  label_en: 'Median Sales Price',         label_es: 'Precio Mediano de Venta',     value: '$440,000', delta: '<1%',  delta_direction: 'up' },
    { key: 'closed_sales',        label_en: 'Closed Sales',               label_es: 'Ventas Cerradas',             value: '2,953',    delta: '3.4%', delta_direction: 'up' },
    { key: 'new_listings',        label_en: 'New Listings',               label_es: 'Listados Nuevos',             value: '4,786',    delta: '16.7%', delta_direction: 'down' },
    { key: 'months_of_inventory', label_en: 'Months of Inventory',        label_es: 'Meses de Inventario',         value: '4.7',      delta: '0.3',  delta_direction: 'down' },
    { key: 'active_listings',     label_en: 'Active Listings',            label_es: 'Listados Activos',            value: '12,508',   delta: '16.6%', delta_direction: 'down' },
    { key: 'pending_sales',       label_en: 'Pending Sales',              label_es: 'Ventas Pendientes',           value: '3,310',    delta: '14.3%', delta_direction: 'up' },
    { key: 'sales_dollar_volume', label_en: 'Sales Dollar Volume',        label_es: 'Volumen Total de Ventas',     value: '$1.74 Billion', delta: '2.2%', delta_direction: 'down' },
    { key: 'avg_days_on_market',  label_en: 'Average Days on Market',     label_es: 'Dias Promedio en el Mercado', value: '61',       delta: '0',    delta_direction: 'flat' },
    { key: 'avg_close_to_list',   label_en: 'Average Close to List Price', label_es: 'Cerca al Precio de Lista',   value: '94.5%' },
  ],
  listing_counts: [],
  price_bands: [],
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

export default function RealtyLineReportCard({ variant = 'inline' }: Props) {
  const [data, setData] = useState<RealtyLineReport | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');

  useEffect(() => {
    let alive = true;
    fetch('/api/realtyline-mls/current', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        if (j && j.ok && j.report) setData(j.report as RealtyLineReport);
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
        ? {
            indicators: 'Indicadores del mes',
            listings: 'Listados',
            priceBands: 'Por rango de precio (% de ventas)',
            members: 'Los miembros de ABOR pueden',
            signInLink: 'iniciar sesion en ABOR para descargar el informe completo',
          }
        : {
            indicators: 'Monthly indicators',
            listings: 'Listings',
            priceBands: 'By price band (share of sales)',
            members: 'ABOR members can',
            signInLink: 'sign in to ABOR to download the full Central Texas Housing report',
          },
    [lang],
  );

  function trackImpression() {
    try {
      const w = window as unknown as { posthog?: { capture: (e: string, p?: unknown) => void } };
      w.posthog?.capture?.('realtyline_mls_card_view', { variant, month: d.month_label });
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    const el = document.getElementById(`realtyline-card-${variant}`);
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

  const hasListings = Array.isArray(d.listing_counts) && d.listing_counts.length > 0;
  const hasBands = Array.isArray(d.price_bands) && d.price_bands.length > 0;

  return (
    <article
      id={`realtyline-card-${variant}`}
      className="bg-white border-b border-gray-200"
      aria-label={`ABOR MLS Summary Report ${d.month_label}`}
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
              <span>ABOR Report</span>
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

          {/* Indicator stats — 3 cols on mobile to match the ABoR 3x3 grid */}
          <div
            className="grid grid-cols-3 gap-x-3 gap-y-3 py-3 mb-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {d.indicator_stats.map((s) => (
              <div key={s.key || s.label_en}>
                <div className="flex items-baseline gap-1 flex-wrap">
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

          {/* Listing counts — only if populated */}
          {hasListings && (
            <>
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
            </>
          )}

          {/* Price bands — only if populated */}
          {hasBands && (
            <>
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
            </>
          )}

          {/* Member disclaimer / deep-link */}
          <p
            className="text-[11px] leading-snug text-gray-500 pt-3"
            style={{ borderTop: '1px dashed #e5e7eb' }}
          >
            {sectionLabels.members}{' '}
            <a
              href="https://austin.clareityiam.net/idp/login"
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
