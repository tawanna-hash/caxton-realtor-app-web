// app/admin/getpaid/statements/page.tsx
//
// Partner statement picker: lists every advertiser with at least one
// non-void, non-draft invoice and their current outstanding balance, so
// staff can jump straight to that partner's Statement of Account.
// Styled to match the invoice document (app/admin/invoices/[id]/preview).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { formatCents } from '@/lib/invoices';

export const dynamic = 'force-dynamic';

type PartnerRow = {
  advertiser_id: number;
  advertiser_name: string;
  outstanding_cents: number;
  overdue_cents: number;
  open_invoice_count: number;
};

export default async function StatementsIndexPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  const partners = (await sql`
    SELECT
      adv.id AS advertiser_id,
      adv.name AS advertiser_name,
      SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0))::int AS outstanding_cents,
      SUM(
        CASE WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
          THEN GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0)
          ELSE 0 END
      )::int AS overdue_cents,
      COUNT(*) FILTER (WHERE GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0) > 0) AS open_invoice_count
    FROM invoices i
    JOIN advertisers adv ON adv.id = i.advertiser_id
    LEFT JOIN LATERAL (
      SELECT SUM(p.amount_cents)::int AS amount_paid_cents
      FROM invoice_payments p WHERE p.invoice_id = i.id
    ) pay ON true
    WHERE i.status NOT IN ('void', 'draft')
    GROUP BY adv.id, adv.name
    HAVING SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0)) > 0
    ORDER BY overdue_cents DESC, outstanding_cents DESC
  `.catch(() => [] as unknown[])) as unknown as PartnerRow[];

  const totalOutstanding = partners.reduce((sum, p) => sum + p.outstanding_cents, 0);
  const totalOverdue = partners.reduce((sum, p) => sum + p.overdue_cents, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-10">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-gray-900">Partner statements</h1>
        <p className="text-sm text-gray-500">
          Statement of account per partner, with a payment link for every outstanding invoice.
        </p>
      </div>

      <article className="bg-white px-6 py-8 text-[11px] leading-[1.35] text-neutral-800 shadow-sm ring-1 ring-gray-200 sm:px-10">
        <div className="mb-5 grid grid-cols-3 gap-4 border-b border-neutral-300 pb-5">
          <div>
            <div className="text-lg font-semibold text-neutral-900">{partners.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">Partners with a balance</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-neutral-900">{formatCents(totalOutstanding)}</div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">Total outstanding</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-orange-700">{formatCents(totalOverdue)}</div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500">Total overdue</div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_90px_100px_100px_110px] bg-neutral-900 px-3 py-2 font-semibold text-white">
          <div>Partner</div>
          <div className="text-center">Invoices</div>
          <div className="text-right">Overdue</div>
          <div className="text-right">Outstanding</div>
          <div className="text-right">Statement</div>
        </div>
        {partners.map((partner) => (
          <div
            key={partner.advertiser_id}
            className="grid grid-cols-[1fr_90px_100px_100px_110px] items-center border-b border-neutral-200 px-3 py-3"
          >
            <div className="truncate font-semibold">{partner.advertiser_name}</div>
            <div className="text-center">{partner.open_invoice_count}</div>
            <div className="text-right">
              {partner.overdue_cents > 0 ? (
                <span className="font-semibold text-orange-700">{formatCents(partner.overdue_cents)}</span>
              ) : (
                '—'
              )}
            </div>
            <div className="text-right font-semibold">{formatCents(partner.outstanding_cents)}</div>
            <div className="text-right">
              <Link
                href={`/admin/getpaid/statements/${partner.advertiser_id}`}
                className="font-semibold text-orange-700 hover:underline"
              >
                View →
              </Link>
            </div>
          </div>
        ))}
        {partners.length === 0 && (
          <div className="border-b border-neutral-200 px-3 py-8 text-center italic text-neutral-500">
            No partners with an outstanding balance right now.
          </div>
        )}
      </article>
    </div>
  );
}
