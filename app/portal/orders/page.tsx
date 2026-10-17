// app/portal/orders/page.tsx
//
// Advertiser orders, driven by invoicing: every non-draft invoice for the
// signed-in partner with balance, due date, status and a pay/view link, plus
// the signed agreements below.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AgreementRow = {
  id: string;
  ad_size: string | null;
  type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  amount_cents: number | null;
  signed_document: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  number: string | null;
  status: string;
  total_cents: number;
  paid_cents: number;
  issued_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  description: string | null;
};

const INVOICE_TONE: Record<string, string> = {
  paid: 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30',
  sent: 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30',
  overdue: 'bg-[#FFEAE6] text-[#661102] border-[#FF2A04]/30',
};

const STATUS_TONE: Record<string, string> = {
  active: 'bg-[#E0FBE0] text-[#005A00] border-[#00E200]/30',
  signed: 'bg-[#F6F3FB] text-[#42277C] border-[#D9CFF0]',
  sent: 'bg-[#FEF8CC] text-[#645600] border-[#FAD800]/30',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-gray-50 text-gray-500 border-gray-200',
  cancelled: 'bg-[#FFEAE6] text-[#661102] border-[#FF2A04]/30',
};

function fmtUsd(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  // Render YYYY-MM-DD as a friendly date in UTC so we never shift the day
  // because of the viewer's timezone.
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return d;
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  return `${fmtDate(start)} ${'\u2013'} ${fmtDate(end)}`;
}

export default async function PortalOrders() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();

  const [invoiceRows, rows] = await Promise.all([
    sql`
      SELECT i.id, i.number, i.status, i.total_cents,
             COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)::int AS paid_cents,
             i.issued_at::text AS issued_at, i.due_date::text AS due_date, i.paid_at::text AS paid_at,
             i.line_items->0->>'description' AS description
        FROM invoices i
       WHERE i.advertiser_id = ${user.advertiser_id} AND i.status IN ('sent', 'overdue', 'paid')
       ORDER BY COALESCE(i.issued_at, i.created_at) DESC
    `,
    sql`
      SELECT id, ad_size, type, status,
             start_date::text AS start_date, end_date::text AS end_date,
             amount_cents, signed_document, stripe_payment_intent_id, created_at::text AS created_at
        FROM agreements
       WHERE advertiser_id = ${user.advertiser_id}
       ORDER BY COALESCE(start_date, created_at::date) DESC, created_at DESC
    `,
  ]) as unknown as [InvoiceRow[], AgreementRow[]];

  const today = new Date().toISOString().slice(0, 10);
  const withBalance = invoiceRows.map((r) => {
    const balance = r.status === 'paid' ? 0 : Math.max(0, r.total_cents - r.paid_cents);
    const overdue = r.status !== 'paid' && !!r.due_date && r.due_date.slice(0, 10) < today;
    return { ...r, balance, shown: overdue ? 'overdue' : r.status };
  });
  const open = withBalance.filter((r) => r.balance > 0);
  const openTotal = open.reduce((n, r) => n + r.balance, 0);
  const overdueTotal = open.filter((r) => r.shown === 'overdue').reduce((n, r) => n + r.balance, 0);
  const paidTotal = withBalance.filter((r) => r.status === 'paid').reduce((n, r) => n + r.total_cents, 0);
  const fmtUsd2 = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Orders and invoices</div>
        <PageTitle size="md">My orders</PageTitle>
        <p className="text-gray-600 mt-1 text-sm">
          Your invoices for {user.company || user.name}, newest first. Pay any open invoice online.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">Balance due</div>
          <div className="font-serif text-3xl text-gray-900 mt-1">{fmtUsd2(openTotal)}</div>
          <div className="text-sm text-gray-600 mt-1">{open.length} open invoice{open.length === 1 ? '' : 's'}</div>
        </div>
        <div className={`rounded-md border p-4 ${overdueTotal > 0 ? 'border-[#FF2A04]/30 bg-[#FFEAE6]' : 'border-gray-200 bg-white'}`}>
          <div className="text-xs uppercase tracking-wider text-gray-500">Past due</div>
          <div className="font-serif text-3xl text-gray-900 mt-1">{fmtUsd2(overdueTotal)}</div>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wider text-gray-500">Paid to date</div>
          <div className="font-serif text-3xl text-gray-900 mt-1">{fmtUsd2(paidTotal)}</div>
        </div>
      </section>

      {withBalance.length === 0 ? (
        <section className="rounded-md border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600 text-sm">
          No invoices yet. When we issue an invoice it appears here.
        </section>
      ) : (
        <section className="overflow-hidden rounded-md border border-gray-200 bg-white">
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium text-right">Total</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {withBalance.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">
                    <div className="font-medium">{r.number ?? 'Invoice'}</div>
                    {r.description && <div className="text-xs text-gray-500 truncate max-w-[16rem]">{r.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{fmtDate(r.issued_at)}</td>
                  <td className="px-4 py-3 text-gray-700">{fmtDate(r.due_date)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{fmtUsd2(r.total_cents)}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmtUsd2(r.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium capitalize ${INVOICE_TONE[r.shown] ?? STATUS_TONE.draft}`}>{r.shown === 'paid' && r.paid_at ? `Paid ${fmtDate(r.paid_at)}` : r.shown}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/portal/invoices/${r.id}`} className="text-[#42277C] font-medium hover:underline">{r.balance > 0 ? 'Pay now' : 'View'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="md:hidden divide-y divide-gray-100">
            {withBalance.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-gray-900 font-medium">{r.number ?? 'Invoice'}</div>
                    <div className="text-xs text-gray-600 mt-1">Issued {fmtDate(r.issued_at)} - Due {fmtDate(r.due_date)}</div>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${INVOICE_TONE[r.shown] ?? STATUS_TONE.draft}`}>{r.shown}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-gray-900 font-semibold">{fmtUsd2(r.balance > 0 ? r.balance : r.total_cents)}</div>
                  <Link href={`/portal/invoices/${r.id}`} className="text-sm text-[#42277C] font-medium hover:underline">{r.balance > 0 ? 'Pay now' : 'View'}</Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl text-gray-900">Agreements</h2>
          <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => {
                const tone = STATUS_TONE[r.status] || STATUS_TONE.draft;
                return (
                  <li key={r.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-gray-900 font-medium truncate">{r.ad_size || r.type || 'Custom placement'}</div>
                      <div className="text-xs text-gray-600 mt-0.5">{fmtRange(r.start_date, r.end_date)} - {fmtUsd(r.amount_cents)}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>{r.status}</span>
                      {r.signed_document && (
                        <Link href={r.signed_document} target="_blank" rel="noopener noreferrer" className="text-[#42277C] hover:underline">View PDF</Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
