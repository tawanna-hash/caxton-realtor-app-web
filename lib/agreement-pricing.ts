// lib/agreement-pricing.ts
// Pure pricing helpers — mirror agComputeExp from pb_index.html line 8252.

import { AD_RATE_TABLE, FREQ_PKG_AG, FREQ_MONTHS, MONTHS_LIST, MONTH_ORDER } from './pressbook-constants';

export function lookupRate(freq: string, size: string): { rate: number; pkg: string } | null {
  const tbl = AD_RATE_TABLE[freq];
  if (!tbl) return null;
  const rate = tbl[size];
  if (rate === undefined) return null;
  const pkg = FREQ_PKG_AG[freq] ?? freq;
  return { rate, pkg };
}

/** Apply 3% credit-card surcharge, rounded to nearest cent. */
export function applyCcSurcharge(base: number): number {
  return Math.round(base * 1.03 * 100) / 100;
}

/** 20% page-position premium, rounded to nearest cent. */
export function pagePositionPremium(rate: number): number {
  return Math.round(rate * 0.2 * 100) / 100;
}

/** Total = rate - discount + premium */
export function computeTotal(rate: number, discount: number, premium: number): number {
  return rate - discount + premium;
}

/**
 * Mirror of Pressbook agComputeExp (pb_index line 8252).
 * Returns YYYY-MM-DD string or '' if nothing can be computed.
 *
 * @param checked   Record<monthKey, boolean>  e.g. { january: true, ... }
 * @param years     Record<monthKey, string>   e.g. { january: '2026', ... }
 * @param freq      e.g. '6x'
 * @param signDate  YYYY-MM-DD or ''
 */
export function computeExp(
  checked: Record<string, boolean>,
  years: Record<string, string>,
  freq: string,
  signDate: string,
): string {
  // Primary: latest checked month/year from timing grid → last day of that month
  let latestYear = 0;
  let latestMonth = 0;

  for (const m of MONTHS_LIST) {
    if (!checked[m.k]) continue;
    const yr = years[m.k] ?? '';
    if (!/^\d{4}$/.test(yr)) continue;
    const y = parseInt(yr, 10);
    const mo = MONTH_ORDER[m.k] ?? 0;
    if (y > latestYear || (y === latestYear && mo > latestMonth)) {
      latestYear = y;
      latestMonth = mo;
    }
  }

  let tDate: string | null = null;
  if (latestYear && latestMonth) {
    // Last day of the latest checked month
    const ld = new Date(latestYear, latestMonth, 0);
    tDate =
      ld.getFullYear() +
      '-' + String(ld.getMonth() + 1).padStart(2, '0') +
      '-' + String(ld.getDate()).padStart(2, '0');
  }

  // Fallback: sign date + FREQ_MONTHS[freq] months
  let sDate: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(signDate)) {
    const months = FREQ_MONTHS[freq] ?? 1;
    const base = new Date(signDate + 'T00:00:00');
    base.setMonth(base.getMonth() + months);
    sDate =
      base.getFullYear() +
      '-' + String(base.getMonth() + 1).padStart(2, '0') +
      '-' + String(base.getDate()).padStart(2, '0');
  }

  // Use whichever is later; prefer timing-grid date if both exist
  if (tDate && sDate) return signDate > tDate ? sDate : tDate;
  return tDate ?? sDate ?? '';
}
