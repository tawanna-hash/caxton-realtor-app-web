import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { formatCents } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PageTitle from '@/components/ui/PageTitle';

export const dynamic = 'force-dynamic';

type PayoutRow = { batch_date: string; amount_cents: number; transactions: number; deposit_id: string | null };

export default async function StripePayoutsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const payouts = await sql`
    SELECT to_char(date_trunc('day', paid_at), 'YYYY-MM-DD') AS batch_date,
      sum(total_cents)::bigint AS amount_cents,
      count(*)::int AS transactions,
      max(stripe_payment_intent_id) AS deposit_id
    FROM invoices
    WHERE status = 'paid' AND paid_at IS NOT NULL AND stripe_payment_intent_id IS NOT NULL
    GROUP BY 1 ORDER BY 1 DESC
  `.catch(() => [] as unknown[]);
  const rows = payouts as unknown as PayoutRow[];
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div><div className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Admin · Get Paid</div><PageTitle size="md">Payouts from Stripe</PageTitle></div>
      <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-5"><div><div className="font-medium text-gray-900">Stripe settlement activity</div><p className="mt-1 text-sm text-gray-600">Paid card transactions grouped by settlement date.</p></div><div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">Connected</div></div>
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Batch date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Fees</th><th className="px-4 py-3">No. of transactions</th><th className="px-4 py-3">Payout status</th><th className="px-4 py-3">Deposit ID</th></tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row) => <tr key={row.batch_date}><td className="px-4 py-3">{row.batch_date}</td><td className="px-4 py-3">{formatCents(Number(row.amount_cents))}</td><td className="px-4 py-3 text-gray-500">Calculated by Stripe</td><td className="px-4 py-3">{row.transactions}</td><td className="px-4 py-3"><span className="text-emerald-700">● Paid</span></td><td className="px-4 py-3 font-mono text-xs">{row.deposit_id ?? '—'}</td></tr>)}</tbody></table>
        {rows.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No Stripe payouts have been recorded yet.</div>}
      </div>
    </div>
  );
}
