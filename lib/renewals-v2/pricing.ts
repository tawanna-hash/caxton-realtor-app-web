// lib/renewals-v2/pricing.ts
//
// Renewals (Beta). Pure renewal pricing, mirroring the rate-lock rule used by
// the admin Renew drawer: an expired prior agreement no longer carries its
// locked rate; the renewal uses the current rate card, capped at +2% over
// the prior rate (RENEWAL_CAP_PCT). Channels without a rate card keep the prior rate.

import { lookupRate } from '@/lib/agreement-pricing';

/** Largest increase a renewal can carry over the prior rate. */
export const RENEWAL_CAP_PCT = 2;

export type RenewalPrice = {
  rateCents: number | null;
  priorRateCents: number | null;
  cardRateCents: number | null;
  capped: boolean;
  repriced: boolean;
};

export function computeRenewalPrice(
  prior: {
    ad_rate_cents: number | null;
    frequency: string | null;
    ad_size: string | null;
    exp_date: string | null;
    end_date: string | null;
  },
  now = new Date(),
): RenewalPrice {
  const priorRateCents = prior.ad_rate_cents;
  const base: RenewalPrice = {
    rateCents: priorRateCents,
    priorRateCents,
    cardRateCents: null,
    capped: false,
    repriced: false,
  };
  const expRaw = (prior.exp_date ?? prior.end_date ?? '').slice(0, 10);
  if (!expRaw || priorRateCents == null || !prior.frequency || !prior.ad_size) return base;
  const exp = new Date(`${expRaw}T00:00:00`);
  if (Number.isNaN(exp.getTime()) || now <= exp) return base; // still inside the rate lock
  const looked = lookupRate(prior.frequency, prior.ad_size);
  if (!looked) return base;
  const oldRate = priorRateCents / 100;
  const cardRate = looked.rate;
  const capped = cardRate > oldRate * (1 + RENEWAL_CAP_PCT / 100);
  const newRate = capped
    ? Math.round(oldRate * (1 + RENEWAL_CAP_PCT / 100) * 100) / 100
    : Math.max(cardRate, oldRate);
  return {
    rateCents: Math.round(newRate * 100),
    priorRateCents,
    cardRateCents: Math.round(cardRate * 100),
    capped,
    repriced: Math.round(newRate * 100) !== priorRateCents,
  };
}

/** First/last day of the next term (YYYY-MM-DD) with the 15th-cutoff rule. */
export function computeNextTerm(
  priorExp: string | null,
  months: number,
  now = new Date(),
): { start: string; end: string; months: Record<string, string> } {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  let startYear: number;
  let startMonth: number; // 0-based
  const exp = priorExp ? new Date(`${priorExp.slice(0, 10)}T00:00:00Z`) : null;
  if (exp && !Number.isNaN(exp.getTime()) && exp >= today) {
    // Prior term still running: the renewal starts the month after it ends.
    startYear = exp.getUTCFullYear();
    startMonth = exp.getUTCMonth() + 1;
  } else {
    // Already expired: same-month start if signed on or before the 15th.
    startYear = today.getUTCFullYear();
    startMonth = today.getUTCDate() <= 15 ? today.getUTCMonth() : today.getUTCMonth() + 1;
  }
  const start = new Date(Date.UTC(startYear, startMonth, 1));
  const end = new Date(Date.UTC(startYear, startMonth + months, 0));
  const keys = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const out: Record<string, string> = {};
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(startYear, startMonth + i, 1));
    out[keys[d.getUTCMonth()]] = String(d.getUTCFullYear());
  }
  return { start: iso(start), end: iso(end), months: out };
}

export function freqMonths(frequency: string | null | undefined): number {
  const m = /^(\d+)/.exec(String(frequency ?? '').trim());
  const n = m ? parseInt(m[1], 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}
