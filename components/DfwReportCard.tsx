'use client';

/**
 * DfwReportCard
 * ─────────────────────────────────────────────────────────────────────────
 * Dallas/Ft. Worth monthly market report card. Same look as the Austin
 * ABOR card (RealtyLineReportCard): brand strip, eyebrow badge + EN/ES
 * toggle, "<Month> MLS Summary" title, hero stat, 3-column indicator grid
 * with ▲/▼ deltas, and a board footer link.
 *
 *   board="metrotex" → Dallas (MetroTex). Hero = median price.
 *   board="gfwar"    → Ft. Worth (GFWAR). Hero = sales dollar volume.
 */

import { useState } from 'react';
import { monthLabel, type DfwBoard, type DfwMarketReport, type DfwMetrics } from '@/lib/dfw-markets';

const NEWSLINE = '#301D5D';

type Dir = 'up' | 'down' | 'flat' | undefined;

interface Stat { key: string; en: string; es: string; value?: string | null; delta?: string | null }

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function monthLabelEs(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS_ES[(m || 1) - 1]} ${y}`;
}

function dirOf(delta?: string | null): Dir {
  if (!delta) return undefined;
  const t = delta.trim();
  if (/^[+-]?0(\.0+)?%?$/.test(t)) return 'flat';
  return t.startsWith('-') ? 'down' : 'up';
}

function dirGlyph(d: Dir): string {
  if (d === 'up') return '\u25B2';
  if (d === 'down') return '\u25BC';
  if (d === 'flat') return '\u2014';
  return '';
}

function dirColor(d: Dir): string {
  if (d === 'down') return '#661102';
  if (d === 'up') return '#005A00';
  return '#6b7280';
}

// "$900,962,309" -> "$900.96M", "$1,402,000,000" -> "$1.40B" (ABOR card style).
function compactMoney(v?: string | null): string | null | undefined {
  if (!v) return v;
  const n = Number(v.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 10_000_000) return v;
  return n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : `$${(n / 1e6).toFixed(2)}M`;
}

function bare(delta?: string | null): string {
  return (delta ?? '').trim().replace(/^[+-]/, '');
}

function statsFor(board: DfwBoard, m: DfwMetrics): Stat[] {
  if (board === 'metrotex') {
    return [
      { key: 'closed', en: 'Closed Sales', es: 'Ventas Cerradas', value: m.closedSales, delta: m.closedSalesYoY },
      { key: 'active', en: 'Active Listings', es: 'Listados Activos', value: m.activeListings, delta: m.activeListingsYoY },
      { key: 'moi', en: 'Months of Inventory', es: 'Meses de Inventario', value: m.monthsInventory },
      { key: 'dom', en: 'Days on Market', es: 'Dias en el Mercado', value: m.daysOnMarket },
      { key: 'dtc', en: 'Days to Close', es: 'Dias para Cerrar', value: m.daysToClose },
      {
        key: 'share',
        en: m.marketShareBand ? `Market Share ${m.marketShareBand}` : 'Top Price Range Share',
        es: m.marketShareBand ? `Participacion ${m.marketShareBand}` : 'Participacion por Precio',
        value: m.marketSharePct,
      },
    ];
  }
  return [
    { key: 'median', en: 'Median Sales Price', es: 'Precio Mediano de Venta', value: m.medianPrice, delta: m.medianPriceYoY },
    { key: 'closed', en: 'Closed Sales', es: 'Ventas Cerradas', value: m.closedSales, delta: m.closedSalesYoY },
    { key: 'new', en: 'New Listings', es: 'Listados Nuevos', value: m.newListings },
    { key: 'moi', en: 'Months of Inventory', es: 'Meses de Inventario', value: m.monthsInventory },
    { key: 'active', en: 'Active Listings', es: 'Listados Activos', value: m.activeListings },
    { key: 'pending', en: 'Pending Sales', es: 'Ventas Pendientes', value: m.pendingSales },
    { key: 'avg', en: 'Average Sales Price', es: 'Precio Promedio de Venta', value: m.averagePrice, delta: m.averagePriceYoY },
    { key: 'dom', en: 'Average Days on Market', es: 'Dias Promedio en el Mercado', value: m.daysOnMarket },
    { key: 'ctl', en: 'Close to Original List Price', es: 'Cerca al Precio de Lista Original', value: m.closeToListPrice },
  ];
}

export default function DfwReportCard({ report, id }: { report: DfwMarketReport; id?: string }) {
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const m = report.metrics ?? {};
  const isMetro = report.board === 'metrotex';
  const es = lang === 'es';

  const heroValue = isMetro ? m.medianPrice : compactMoney(m.dollarVolume) ?? m.medianPrice;
  const heroDelta = isMetro ? m.medianPriceYoY : m.dollarVolume ? m.dollarVolumeYoY : m.medianPriceYoY;
  const heroDir = dirOf(heroDelta);
  const heroLabel = isMetro
    ? es ? 'Precio mediano \u00b7 ano tras ano' : 'Median sales price \u00b7 YoY'
    : m.dollarVolume
      ? es ? 'Volumen total de ventas \u00b7 residencial \u00b7 ano tras ano' : 'Sales dollar volume \u00b7 residential \u00b7 YoY'
      : es ? 'Precio mediano \u00b7 ano tras ano' : 'Median sales price \u00b7 YoY';

  const boardShort = isMetro ? 'MetroTex' : 'GFWAR';
  const area = report.areaLabel;
  const subtitle = isMetro
    ? es
      ? `El cambio porcentual refleja una comparacion ano tras ano. Indicadores del mercado de ${area} de MetroTex Association of REALTORS y el Texas Real Estate Research Center de Texas A&M.`
      : `Percent change reflects a year-over-year comparison. ${area} market indicators from MetroTex Association of REALTORS and the Texas Real Estate Research Center at Texas A&M.`
    : es
      ? `El cambio porcentual refleja una comparacion ano tras ano. Indicadores residenciales (unifamiliar, condominio, casa adosada) de ${area}, nuevos y existentes, del Greater Fort Worth Association of REALTORS.`
      : `Percent change reflects a year-over-year comparison. ${area} residential indicators (single-family, condo, townhome), new and existing, from the Greater Fort Worth Association of REALTORS.`;

  const stats = statsFor(report.board, m).filter((s) => s.value);
  const source = isMetro ? 'https://www.mymetrotex.com/market-reports/' : report.sourceUrl ?? 'https://gfwar.org/housing-report/';
  const footerLead = es ? `Informe completo de ${boardShort}:` : `Full ${boardShort} report:`;
  const footerLink = isMetro
    ? es ? 'ver los informes de vivienda de MetroTex' : 'view MetroTex housing reports'
    : es ? 'ver el informe de mercado de GFWAR' : 'view the GFWAR market report';

  return (
    <article id={id} className="bg-white border-b border-gray-200" aria-label={`${boardShort} MLS Summary ${area} ${monthLabel(report.month)}`}>
      <div className="bg-white mx-3 my-3 rounded-md overflow-hidden shadow-sm">
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${NEWSLINE} 0%, #5B3FA0 100%)` }} />
        <div className="px-4 pt-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase"
              style={{ background: 'rgba(61,7,64,0.06)', color: NEWSLINE }}
            >
              <span aria-hidden>{'\u25CF'}</span>
              <span>{boardShort} Report</span>
            </span>
            <div className="inline-flex items-center rounded-full p-0.5" style={{ background: 'rgba(48,29,93,0.08)' }}>
              {(['en', 'es'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.12em] uppercase transition"
                  style={{ background: lang === l ? NEWSLINE : 'transparent', color: lang === l ? 'white' : NEWSLINE }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <h3 className="text-[20px] leading-tight font-bold text-gray-900 mb-1">
            {es ? monthLabelEs(report.month) : monthLabel(report.month)} {es ? 'Resumen MLS' : 'MLS Summary'}
            <span className="font-medium text-gray-500"> · {area}</span>
          </h3>
          <p className="text-[13px] text-gray-500 leading-snug mb-4">{subtitle}</p>

          {heroValue && (
            <>
              <div className="flex items-baseline gap-3">
                <div className="text-[38px] font-bold leading-none" style={{ color: '#2c0530' }}>{heroValue}</div>
                {heroDelta && (
                  <div className="text-[13px] font-bold" style={{ color: dirColor(heroDir) }}>
                    {dirGlyph(heroDir)} {bare(heroDelta)}
                  </div>
                )}
              </div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500 mt-2 mb-4">{heroLabel}</div>
            </>
          )}

          {stats.length > 0 && (
            <div className="grid grid-cols-3 gap-x-3 gap-y-3 py-3 mb-3" style={{ borderTop: '1px dashed #e5e7eb' }}>
              {stats.map((s) => {
                const d = dirOf(s.delta);
                return (
                  <div key={s.key}>
                    <div className="flex items-baseline gap-1 flex-wrap">
                      <div className="text-[15px] font-bold text-gray-900 leading-tight">{s.value}</div>
                      {s.delta && (
                        <div className="text-[10px] font-bold" style={{ color: dirColor(d) }}>
                          {dirGlyph(d)} {bare(s.delta)}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] uppercase tracking-[0.10em] text-gray-500 mt-0.5 leading-tight">{es ? s.es : s.en}</div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-[11px] leading-snug text-gray-500 pt-3" style={{ borderTop: '1px dashed #e5e7eb' }}>
            {footerLead}{' '}
            <a href={source} target="_blank" rel="noopener noreferrer" className="underline font-medium" style={{ color: NEWSLINE }}>
              {footerLink}
            </a>
            .
          </p>
        </div>
      </div>
    </article>
  );
}
