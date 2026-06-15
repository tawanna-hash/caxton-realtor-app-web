// app/admin/billing/_components/helpers.ts
//
// Date/string coercion helpers shared by every billing-tab component.

import type { AgreementWithAdvertiser } from '@/lib/agreements';

/** Coerce a `timestamptz`/`date` value (string | Date | null) to a YYYY-MM-DD string. */
export function toISODateString(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  // Some neon driver paths return ISO-shaped objects — fall back to String()
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function getDaysUntil(s: string | Date | null | undefined): number | null {
  const iso = toISODateString(s);
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(iso); e.setHours(0, 0, 0, 0);
  if (Number.isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - t.getTime()) / 86400000);
}

export function humanDate(iso: string | Date | null | undefined): string {
  const s = toISODateString(iso);
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return s;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return s; }
}

/** Format a DATE column value as YYYY-MM-DD (display version returns em-dash for null). */
export function formatDateISO(d: string | Date | null | undefined): string {
  if (d == null) return '—';
  const s = toISODateString(d);
  return s || '—';
}

// ── Renewal bucket helper ─────────────────────────────────────────────────────
export type RenewalBucket = 'expired' | 'due_soon' | 'upcoming' | 'fresh';

export function renewalInfoFor(ag: AgreementWithAdvertiser): {
  bucket: RenewalBucket;
  daysUntilExpiry: number | null;
  noticeSent: boolean;
} {
  const noticeSent = !!ag.renewal_notice_date;
  const expDate = ag.exp_date ?? ag.end_date;
  if (!expDate) return { bucket: 'fresh', daysUntilExpiry: null, noticeSent };
  const days = getDaysUntil(expDate as string);
  let bucket: RenewalBucket;
  if (days === null) bucket = 'fresh';
  else if (days < 0) bucket = 'expired';
  else if (days <= 30) bucket = 'due_soon';
  else if (days <= 90) bucket = 'upcoming';
  else bucket = 'fresh';
  return { bucket, daysUntilExpiry: days, noticeSent };
}
