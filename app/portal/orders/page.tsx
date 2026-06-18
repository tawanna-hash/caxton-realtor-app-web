// app/portal/orders/page.tsx
//
// Advertiser order history. Lists every agreement (self-serve checkout or
// admin-created) tied to the signed-in advertiser_id, newest first, with
// status, flight dates, amount, and a link to the signed PDF when present.

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

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  signed: 'bg-blue-50 text-blue-700 border-blue-200',
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  expired: 'bg-gray-50 text-gray-500 border-gray-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
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

  const rows = (await sql`
    SELECT id,
           ad_size,
           type,
           status,
           start_date::text   AS start_date,
           end_date::text     AS end_date,
           amount_cents,
           signed_document,
           stripe_payment_intent_id,
           created_at::text   AS created_at
    FROM agreements
    WHERE advertiser_id = ${user.advertiser_id}
    ORDER BY COALESCE(start_date, created_at::date) DESC, created_at DESC
  `) as unknown as AgreementRow[];

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Order history
        </div>
        <PageTitle size="md">
          My orders
        </PageTitle>
        <p className="text-gray-600 mt-1 text-sm">
          Every ad placement and sponsorship tied to {user.company || user.name}, newest first.
        </p>
      </header>

      {rows.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <h2
            className="font-serif text-xl text-gray-900 mb-2"
          >
            No orders yet
          </h2>
          <p className="text-gray-600 text-sm mb-5 max-w-md mx-auto">
            When you book a placement or sign an agreement, it shows up here with
            the flight dates, amount, and a copy of the signed PDF.
          </p>
          <Link
            href="/advertise/portal"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 transition"
          >
            Browse ad placements
            <span aria-hidden>{'\u2192'}</span>
          </Link>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {/* Desktop table */}
          <table className="hidden md:table w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 font-medium">Placement</th>
                <th className="px-4 py-3 font-medium">Flight</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const tone = STATUS_TONE[r.status] || STATUS_TONE.draft;
                const placement = r.ad_size || r.type || 'Custom placement';
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{placement}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {fmtRange(r.start_date, r.end_date)}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {fmtUsd(r.amount_cents)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {r.signed_document ? (
                        <Link
                          href={r.signed_document}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          View PDF
                        </Link>
                      ) : (
                        <span className="text-gray-400">{'\u2014'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile cards */}
          <ul className="md:hidden divide-y divide-gray-100">
            {rows.map((r) => {
              const tone = STATUS_TONE[r.status] || STATUS_TONE.draft;
              const placement = r.ad_size || r.type || 'Custom placement';
              return (
                <li key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-gray-900 font-medium truncate">
                        {placement}
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {fmtRange(r.start_date, r.end_date)}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${tone}`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-gray-900 font-semibold">
                      {fmtUsd(r.amount_cents)}
                    </div>
                    {r.signed_document && (
                      <Link
                        href={r.signed_document}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-700 hover:underline"
                      >
                        View PDF
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h2
          className="font-serif text-lg text-gray-900 mb-1"
        >
          Need to add another placement?
        </h2>
        <p className="text-sm text-gray-600 mb-3">
          Self-serve checkout takes about two minutes, and bundles unlock when
          you book two or more markets together.
        </p>
        <Link
          href="/advertise/portal"
          className="text-sm font-semibold text-purple-700 hover:text-purple-900"
        >
          Browse placements {'\u2192'}
        </Link>
      </section>
    </div>
  );
}
