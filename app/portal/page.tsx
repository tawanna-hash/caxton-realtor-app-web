// app/portal/page.tsx
//
// Portal dashboard in the Mint kit style: balance hero with a billing chart,
// next payment, stat tiles, and recent invoices.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, ClipboardList, FileSignature, FileText, Receipt } from 'lucide-react';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { IconSquare, MintCard, StatTile } from '@/components/portal/Mint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Inv = { id: string; number: string | null; status: string; total_cents: number; paid_cents: number; due_date: string | null };

const usd0 = (c: number) => `$${(c / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const usd2 = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtDay(d: string | null): string {
  if (!d) return 'No due date';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function PortalHome() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');

  await ensureSchema();
  const sql = getSql();
  const adv = user.advertiser_id;

  const [files, forms, invoices, agreements, months] = (await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM portal_files WHERE advertiser_id = ${adv} AND visibility = 'visible'`,
    sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE submitted_at IS NULL)::int AS open FROM portal_form_assignments WHERE advertiser_id = ${adv}`,
    sql`
      SELECT i.id, i.number, i.status, i.total_cents,
             COALESCE((SELECT SUM(p.amount_cents) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)::int AS paid_cents,
             i.due_date::text AS due_date
        FROM invoices i
       WHERE i.advertiser_id = ${adv} AND i.status IN ('sent', 'overdue', 'paid')
       ORDER BY COALESCE(i.issued_at, i.created_at) DESC
    `,
    sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active FROM agreements WHERE advertiser_id = ${adv}`,
    sql`
      SELECT to_char(date_trunc('month', COALESCE(issued_at, created_at)), 'YYYY-MM') AS m, SUM(total_cents)::int AS cents
        FROM invoices
       WHERE advertiser_id = ${adv} AND status IN ('sent', 'overdue', 'paid')
         AND COALESCE(issued_at, created_at) >= date_trunc('month', now()) - interval '5 months'
       GROUP BY 1
    `,
  ])) as unknown as [
    { n: number }[],
    { total: number; open: number }[],
    Inv[],
    { total: number; active: number }[],
    { m: string; cents: number }[],
  ];

  const invs = invoices.map((r) => ({ ...r, balance: r.status === 'paid' ? 0 : Math.max(0, r.total_cents - r.paid_cents) }));
  const open = invs.filter((r) => r.balance > 0);
  const balance = open.reduce((n, r) => n + r.balance, 0);
  const paidCount = invs.filter((r) => r.status === 'paid').length;
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = [...open].sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))[0];
  const overdue = nextDue?.due_date != null && nextDue.due_date.slice(0, 10) < today;

  // Last six calendar months, oldest first.
  const byMonth = new Map(months.map((r) => [r.m, r.cents]));
  const now = new Date();
  const series = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - i), 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return { key, label: d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' }), cents: byMonth.get(key) ?? 0 };
  });
  const max = Math.max(1, ...series.map((s) => s.cents));
  const billed6 = series.reduce((n, s) => n + s.cents, 0);

  const formsTotal = forms[0]?.total ?? 0;
  const formsOpen = forms[0]?.open ?? 0;
  const agTotal = agreements[0]?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <MintCard title={`Welcome back, ${user.name}`}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
              <div>
                <div className="text-6xl font-bold leading-none text-[#6D3FD6]">{usd0(balance)}</div>
                <div className="mt-3 text-sm text-gray-600">
                  Balance due across {open.length} open invoice{open.length === 1 ? '' : 's'}
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-[#ECE8F5] pt-4">
                  <IconSquare tone="purple"><Receipt className="h-4 w-4" /></IconSquare>
                  <div className="text-sm text-gray-600">
                    <span className="font-bold text-gray-800">{usd0(billed6)}</span> billed in the last 6 months
                  </div>
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-[#C4B5FD] to-[#8B5CF6] p-5 text-white">
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-white/80">Billed by month</div>
                <div className="flex h-44 items-end justify-between gap-3">
                  {series.map((s) => (
                    <div key={s.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${s.label}: ${usd2(s.cents)}`}>
                      <div className="w-2.5 rounded-full bg-white/90" style={{ height: `${Math.max(4, Math.round((s.cents / max) * 100))}%`, opacity: s.cents ? 1 : 0.35 }} />
                      <span className="text-xs text-white/85">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Files" value={files[0]?.n ?? 0} icon={<FileText className="h-4 w-4" />} tone="purple" href="/portal/files" />
              <StatTile label="Forms to complete" value={formsOpen} icon={<ClipboardList className="h-4 w-4" />} tone="green" ratio={formsTotal ? (formsTotal - formsOpen) / formsTotal : null} sub={formsTotal ? `${formsTotal - formsOpen} of ${formsTotal} done` : undefined} href="/portal/forms" />
              <StatTile label="Open invoices" value={open.length} icon={<Receipt className="h-4 w-4" />} tone={overdue ? 'red' : 'blue'} ratio={invs.length ? paidCount / invs.length : null} sub={`${paidCount} of ${invs.length} paid`} href="/portal/orders" />
              <StatTile label="Active agreements" value={agreements[0]?.active ?? 0} icon={<FileSignature className="h-4 w-4" />} tone="purple" ratio={agTotal ? (agreements[0]?.active ?? 0) / agTotal : null} href="/portal/orders" />
            </div>
          </MintCard>
        </div>

        <div className="space-y-6">
          <MintCard title="Your next payment" className="text-center">
            {nextDue ? (
              <>
                <div className="mt-2 text-5xl font-bold text-[#6D3FD6]">{usd2(nextDue.balance)}</div>
                <p className="mt-4 text-sm text-gray-600">
                  {overdue ? 'Past due since ' : 'Due '}
                  {fmtDay(nextDue.due_date)}
                  {nextDue.number ? ` (invoice #${nextDue.number})` : ''}
                </p>
                <Link href={`/portal/invoices/${nextDue.id}`} className="mt-5 inline-block rounded-full bg-[#301D5D] px-6 py-2.5 text-sm font-medium text-white hover:bg-[#42277C]">
                  Pay now
                </Link>
              </>
            ) : (
              <>
                <div className="mt-2 text-3xl font-bold text-[#6D3FD6]">All paid up</div>
                <p className="mt-3 text-sm text-gray-600">You have no open invoices.</p>
                <Link href="/portal/orders" className="mt-5 inline-block rounded-full border border-[#ECE8F5] px-6 py-2.5 text-sm font-medium text-[#6D3FD6] hover:bg-[#F6F5FB]">
                  View orders
                </Link>
              </>
            )}
          </MintCard>

          <MintCard title="Recent invoices" action={<Link href="/portal/orders" className="text-xs font-medium text-[#6D3FD6] hover:underline">View all</Link>}>
            {invs.length === 0 ? (
              <p className="text-sm text-gray-500">No invoices yet.</p>
            ) : (
              <ul className="space-y-1">
                {invs.slice(0, 5).map((r) => {
                  const tone = r.status === 'paid' ? 'green' : r.balance > 0 && r.due_date && r.due_date.slice(0, 10) < today ? 'red' : 'purple';
                  return (
                    <li key={r.id}>
                      <Link href={`/portal/invoices/${r.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-[#F6F5FB]">
                        <IconSquare tone={tone} size="lg"><Receipt className="h-5 w-5" /></IconSquare>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base text-gray-800">{r.number ? `Invoice #${r.number}` : 'Invoice'}</div>
                          <div className="text-xs text-gray-500">{r.status === 'paid' ? 'Paid' : `Due ${fmtDay(r.due_date)}`}</div>
                        </div>
                        <div className="text-sm font-bold text-gray-800">{usd0(r.total_cents)}</div>
                        <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </MintCard>
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Session ends {new Date(user.session_expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} or when you close your browser.
      </p>
    </div>
  );
}
