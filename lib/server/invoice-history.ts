import { ensureSchema, getSql } from '@/lib/db';
import { PUBLICATIONS, isPublicationId, type Publication } from '@/lib/publications';

export type HistoryRow = {
  id: string; number: string | null; status: string; total_cents: number;
  issued_at: string | Date | null; due_date: string | Date | null;
  paid_cents: number; fee_cents: number; paid_on: string | Date | null; method: string | null;
};

export type InvoiceHistory = {
  advertiserId: number; name: string; brand: string; marketTag: string;
  open: HistoryRow[]; paid: HistoryRow[]; owedCents: number;
};

export const historyMoney = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const historyDay = (v: string | Date | null, tz = 'UTC') => {
  if (!v) return '-';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
};
export const historyMethod = (m: string | null) => (!m || m === 'unspecified' ? '-' : m === 'wave_import' ? 'Recorded payment' : m);

export async function loadInvoiceHistory(advertiserId: number): Promise<InvoiceHistory | null> {
  await ensureSchema();
  const sql = getSql();
  const adv = (await sql`SELECT name, publication FROM advertisers WHERE id = ${advertiserId}`) as unknown as Array<{ name: string; publication: string | null }>;
  if (!adv.length) return null;
  const rows = (await sql`
    SELECT i.id, i.number, i.status, i.total_cents, i.issued_at, i.due_date,
      COALESCE(p.paid_cents, 0)::int AS paid_cents, COALESCE(p.fee_cents, 0)::int AS fee_cents,
      p.paid_on, p.method
    FROM invoices i
    LEFT JOIN LATERAL (
      SELECT SUM(amount_cents) AS paid_cents, SUM(fee_cents) AS fee_cents, MAX(payment_date) AS paid_on,
        (ARRAY_AGG(payment_method ORDER BY payment_date DESC, created_at DESC))[1] AS method
      FROM invoice_payments WHERE invoice_id = i.id
    ) p ON true
    WHERE i.advertiser_id = ${advertiserId} AND i.status NOT IN ('void', 'draft')
    ORDER BY i.issued_at DESC NULLS LAST, i.created_at DESC
  `) as unknown as HistoryRow[];
  // Brand and market come from the partner's own publication.
  const keys = String(adv[0].publication ?? '').split(',').map((x) => x.trim().toLowerCase()).flatMap((x) => (x === 'both' ? ['austin', 'san_antonio'] : [x]));
  const pubs = [...new Set(keys)].filter(isPublicationId).map((k) => PUBLICATIONS.find((p) => p.id === k)).filter((p): p is Publication => Boolean(p));
  const open = rows.filter((r) => r.total_cents - r.paid_cents > 0);
  const paid = rows.filter((r) => r.total_cents - r.paid_cents <= 0);
  return {
    advertiserId, name: adv[0].name,
    brand: pubs.length ? pubs.map((p) => p.label).join(' · ') : 'RealtyLine · Newsline',
    marketTag: pubs.length ? ` (${pubs.map((p) => p.market).join(', ')})` : '',
    open, paid, owedCents: open.reduce((s, r) => s + (r.total_cents - r.paid_cents), 0),
  };
}
