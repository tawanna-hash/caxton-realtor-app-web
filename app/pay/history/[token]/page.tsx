// Public, read-only invoice history for one partner, reached through a signed link.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { verifyInvoiceHistoryToken } from '@/lib/server/invoice-history-token';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'Invoice history', robots: { index: false, follow: false } };

type Row = {
  id: string; number: string | null; status: string; total_cents: number;
  issued_at: string | Date | null; due_date: string | Date | null;
  paid_cents: number; fee_cents: number; paid_on: string | Date | null; method: string | null;
};

const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v: string | Date | null, tz = 'UTC') => {
  if (!v) return '—';
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: tz });
};
const methodLabel = (m: string | null) => (!m || m === 'unspecified' ? '—' : m === 'wave_import' ? 'Recorded payment' : m);

export default async function InvoiceHistoryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const advertiserId = verifyInvoiceHistoryToken(decodeURIComponent(token));
  if (advertiserId == null) notFound();

  await ensureSchema();
  const sql = getSql();
  const adv = (await sql`SELECT name FROM advertisers WHERE id = ${advertiserId}`) as unknown as Array<{ name: string }>;
  if (!adv.length) notFound();
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
  `) as unknown as Row[];

  const open = rows.filter((r) => r.total_cents - r.paid_cents > 0);
  const paid = rows.filter((r) => r.total_cents - r.paid_cents <= 0);
  const owed = open.reduce((s, r) => s + (r.total_cents - r.paid_cents), 0);
  const th = 'px-3 py-2 text-left text-xs font-semibold text-neutral-600';
  const td = 'px-3 py-2 text-sm text-neutral-900 whitespace-nowrap';

  const table = (list: Row[], isOpen: boolean) => (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="min-w-full divide-y divide-neutral-200">
        <thead className="bg-neutral-50">
          <tr>
            <th className={th}>Invoice</th><th className={th}>Issued</th><th className={th}>Due</th>
            <th className={`${th} text-right`}>Total</th>
            {isOpen ? <th className={`${th} text-right`}>Balance</th> : <><th className={th}>Paid on</th><th className={th}>Method</th><th className={`${th} text-right`}>Card fee</th></>}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {list.map((r) => (
            <tr key={r.id}>
              <td className={`${td} font-medium`}>{r.number ?? '—'}</td>
              <td className={td}>{day(r.issued_at, 'America/Chicago')}</td>
              <td className={td}>{day(r.due_date)}</td>
              <td className={`${td} text-right`}>{money(r.total_cents)}</td>
              {isOpen ? <td className={`${td} text-right`}>{money(r.total_cents - r.paid_cents)}</td> : <>
                <td className={td}>{day(r.paid_on)}</td><td className={td}>{methodLabel(r.method)}</td>
                <td className={`${td} text-right`}>{r.fee_cents > 0 ? money(r.fee_cents) : '—'}</td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-sm text-neutral-600">Caxton Publications, Inc. · RealtyLine · Newsline</p>
        <h1 className="text-2xl font-semibold text-neutral-900">Invoice history</h1>
        <p className="text-neutral-700">{adv[0].name}</p>
        <p className="mt-1 text-sm text-neutral-600">As of {day(new Date(), 'America/Chicago')} · Questions? Reply to your invoice email or contact accounting.</p>
      </header>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 p-4"><div className="text-xs text-neutral-600">Open balance</div><div className="text-xl font-semibold">{money(owed)}</div></div>
        <div className="rounded-lg border border-neutral-200 p-4"><div className="text-xs text-neutral-600">Open invoices</div><div className="text-xl font-semibold">{open.length}</div></div>
        <div className="rounded-lg border border-neutral-200 p-4"><div className="text-xs text-neutral-600">Paid invoices</div><div className="text-xl font-semibold">{paid.length}</div></div>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Open invoices</h2>
        {open.length ? table(open, true) : <p className="text-sm text-neutral-600">No open invoices.</p>}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Paid invoices</h2>
        {paid.length ? table(paid, false) : <p className="text-sm text-neutral-600">No paid invoices yet.</p>}
      </section>
    </main>
  );
}
