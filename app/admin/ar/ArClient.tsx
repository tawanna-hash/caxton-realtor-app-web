'use client';

// app/admin/ar/ArClient.tsx
//
// Accounts Receivable dashboard: aging buckets, outstanding-by-advertiser,
// and the recurring-invoice schedule manager.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, agingBucketForDaysPastDue, AGING_BUCKET_LABELS, emptyAgingTotals, type AgingBucket } from '@/lib/invoices';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import { frequencyLabel } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { Kpi } from '@/app/admin/billing/_components/Badges';
import PageTitle from '@/components/ui/PageTitle';
import { RecurringScheduleDrawer } from './RecurringScheduleDrawer';

type Props = {
  initialInvoices: InvoiceWithAdvertiser[];
  initialSchedules: RecurringScheduleWithAdvertiser[];
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  incomeByDay: Array<{ day: string; total_cents: number }>;
};

const QUICK_ACTIONS: Array<{ label: string; href?: string; primary?: boolean }> = [
  { label: 'Get paid online', href: '/admin/invoices' },
  { label: 'Create invoice', href: '/admin/invoices' },
  { label: 'Create payment link', href: '/admin/invoices' },
  { label: 'Create recurring payment' },
  { label: 'Create sales receipt', href: '/admin/invoices' },
  { label: 'Record payment', href: '/admin/invoices' },
];

const BUCKET_ORDER: AgingBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];
const BUCKET_ACCENT: Record<AgingBucket, 'blue' | 'amber' | 'rose'> = {
  current: 'blue', d1_30: 'amber', d31_60: 'amber', d61_90: 'rose', d90_plus: 'rose',
};

function daysPastDue(dueDate: string | null): number {
  if (!dueDate) return -9999; // no due date yet ⇒ treat as current
  const due = new Date(dueDate + 'T00:00:00Z').getTime();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return Math.round((today.getTime() - due) / 86400000);
}

export default function ArClient({ initialInvoices, initialSchedules, advertisers, agreements, incomeByDay }: Props) {
  const router = useRouter();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [bucketFilter, setBucketFilter] = useState<AgingBucket | 'all'>('all');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createSchedule, setCreateSchedule] = useState(false);
  const [editSchedule, setEditSchedule] = useState<RecurringScheduleWithAdvertiser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedDismissed, setFeedDismissed] = useState(false);
  const [compareLastYear, setCompareLastYear] = useState(false);

  const reloadAll = useCallback(async () => {
    const [invRes, schedRes] = await Promise.all([
      fetch('/api/admin/invoices', { cache: 'no-store' }),
      fetch('/api/admin/recurring-invoices', { cache: 'no-store' }),
    ]);
    if (invRes.status === 401 || schedRes.status === 401) { router.push('/admin/login'); return; }
    if (invRes.ok) setInvoices(((await invRes.json()).invoices ?? []).filter((i: InvoiceWithAdvertiser) => i.status !== 'void'));
    if (schedRes.ok) setSchedules((await schedRes.json()).schedules ?? []);
  }, [router]);

  // ── Aging ──────────────────────────────────────────────────────────
  const { bucketTotals, byAdvertiser, unpaidInvoices } = useMemo(() => {
    const totals = emptyAgingTotals();
    const byAdv = new Map<string, { name: string; total: number; buckets: Record<AgingBucket, number> }>();
    const unpaid: Array<InvoiceWithAdvertiser & { bucket: AgingBucket; days: number }> = [];

    for (const inv of invoices) {
      if (inv.status === 'paid' || inv.status === 'void') continue;
      const days = daysPastDue(inv.due_date);
      const bucket = agingBucketForDaysPastDue(days);
      const amt = inv.total_cents ?? 0;
      totals[bucket] += amt;

      const key = inv.advertiser_name ?? `#${inv.advertiser_id}`;
      if (!byAdv.has(key)) byAdv.set(key, { name: key, total: 0, buckets: emptyAgingTotals() });
      const rec = byAdv.get(key)!;
      rec.total += amt;
      rec.buckets[bucket] += amt;

      unpaid.push({ ...inv, bucket, days });
    }

    const advList = Array.from(byAdv.values()).sort((a, b) => b.total - a.total);
    unpaid.sort((a, b) => b.days - a.days);
    return { bucketTotals: totals, byAdvertiser: advList, unpaidInvoices: unpaid };
  }, [invoices]);

  const totalOutstanding = useMemo(
    () => BUCKET_ORDER.reduce((s, b) => s + bucketTotals[b], 0),
    [bucketTotals],
  );

  const filteredUnpaid = useMemo(
    () => (bucketFilter === 'all' ? unpaidInvoices : unpaidInvoices.filter((i) => i.bucket === bucketFilter)),
    [unpaidInvoices, bucketFilter],
  );

  // Sales & Get Paid funnel (QBO-style): Not paid / Paid this month / Deposited.
  const funnel = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let notPaidTotal = 0, notPaidCount = 0;
    let paidTotal = 0, paidCount = 0;
    let depositedTotal = 0, depositedCount = 0;

    for (const inv of invoices) {
      if (inv.status === 'void') continue;
      if (inv.status !== 'paid') {
        notPaidTotal += inv.total_cents ?? 0;
        notPaidCount += 1;
      } else {
        const paidAt = inv.paid_at ? new Date(inv.paid_at) : null;
        if (paidAt && paidAt >= monthStart) {
          paidTotal += inv.total_cents ?? 0;
          paidCount += 1;
          // No separate payouts/deposits table yet — approximate "deposited"
          // as Stripe-settled paid invoices (card payment intent present).
          if (inv.stripe_payment_intent_id) {
            depositedTotal += inv.total_cents ?? 0;
            depositedCount += 1;
          }
        }
      }
    }
    return { notPaidTotal, notPaidCount, paidTotal, paidCount, depositedTotal, depositedCount };
  }, [invoices]);

  const incomeChartData = useMemo(
    () => incomeByDay.map((d) => ({
      day: new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      amount: (d.total_cents ?? 0) / 100,
    })),
    [incomeByDay],
  );

  const incomeThisMonth = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return incomeByDay.reduce((sum, d) => {
      const day = new Date(d.day + 'T00:00:00Z');
      return day >= monthStart ? sum + (d.total_cents ?? 0) : sum;
    }, 0);
  }, [incomeByDay]);

  const overdueCount = useMemo(() => unpaidInvoices.filter((i) => i.days > 0).length, [unpaidInvoices]);
  const overdueTotal = useMemo(
    () => unpaidInvoices.filter((i) => i.days > 0).reduce((s, i) => s + (i.total_cents ?? 0), 0),
    [unpaidInvoices],
  );

  // ── Actions ────────────────────────────────────────────────────────
  const handleGetPaymentLink = useCallback(async (inv: InvoiceWithAdvertiser) => {
    setBusyId(inv.id); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/invoices/${inv.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email: true }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Could not create payment link'); return; }
      if (j.email_status === 'sent') {
        setNotice(`Payment link emailed for invoice ${inv.number ?? inv.id}.`);
      } else if (j.checkout_url) {
        setNotice(`Payment link ready for invoice ${inv.number ?? inv.id}: ${j.checkout_url}`);
      }
      await reloadAll();
    } catch {
      setError('Network error while creating payment link');
    } finally {
      setBusyId(null);
    }
  }, [reloadAll]);

  const handlePauseResume = useCallback(async (s: RecurringScheduleWithAdvertiser) => {
    setBusyId(s.id); setError(null);
    const nextStatus = s.status === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/admin/recurring-invoices/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Update failed');
        return;
      }
      await reloadAll();
    } finally {
      setBusyId(null);
    }
  }, [reloadAll]);

  const handleGenerateNow = useCallback(async (s: RecurringScheduleWithAdvertiser) => {
    if (!confirm(`Generate the next invoice for "${s.name}" right now?`)) return;
    setBusyId(s.id); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/recurring-invoices/${s.id}/generate-now`, { method: 'POST' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error ?? 'Generate failed'); return; }
      if (j.invoice_number) setNotice(`Generated invoice ${j.invoice_number}.`);
      else if (j.skipped_reason) setNotice(`Skipped: ${j.skipped_reason}`);
      await reloadAll();
    } finally {
      setBusyId(null);
    }
  }, [reloadAll]);

  const handleDeleteSchedule = useCallback(async (s: RecurringScheduleWithAdvertiser) => {
    if (s.status === 'active') { setError('Pause the schedule before deleting it.'); return; }
    if (!confirm(`Delete recurring schedule "${s.name}"? This can't be undone.`)) return;
    setBusyId(s.id); setError(null);
    try {
      const res = await fetch(`/api/admin/recurring-invoices/${s.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Delete failed');
        return;
      }
      await reloadAll();
    } finally {
      setBusyId(null);
    }
  }, [reloadAll]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin · Sales &amp; Get Paid</div>
          <PageTitle size="md">Accounts Receivable</PageTitle>
          <p className="text-sm text-gray-600 mt-1">Aging, outstanding balances, and recurring invoice schedules.</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/invoices" className="px-4 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50">All invoices</a>
          <button onClick={() => setCreateSchedule(true)} className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700">+ New recurring schedule</button>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 break-all">{notice}</div>}

      {/* Business feed: overdue-invoices callout, dismissible */}
      {!feedDismissed && overdueCount > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">Business feed</div>
          </div>
          <div className="relative rounded-lg border border-blue-200 bg-blue-50/60 px-5 py-4 max-w-md">
            <button
              onClick={() => setFeedDismissed(true)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-lg leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 mb-1">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-600 text-white text-xs">!</span>
              Overdue invoices
            </div>
            <p className="text-sm text-gray-700 pr-4">
              Over {formatCents(overdueTotal)} worth of invoice reminders are ready for you to review and send.
            </p>
            <button
              onClick={() => setBucketFilter('d1_30')}
              className="text-sm text-blue-700 hover:text-blue-800 font-medium mt-2"
            >
              Review all
            </button>
          </div>
        </div>
      )}

      {/* Quick action row */}
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Create actions</div>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) =>
            action.href ? (
              <a key={action.label} href={action.href} className="px-3 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap">
                {action.label}
              </a>
            ) : (
              <button
                key={action.label}
                onClick={() => setCreateSchedule(true)}
                className="px-3 py-1.5 rounded-full border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              >
                {action.label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Sales & Get Paid funnel */}
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Sales &amp; Get Paid at a glance</div>
        <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-2">Sales &amp; Get Paid funnel</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-0 sm:gap-0 rounded-lg border border-gray-200 overflow-hidden bg-white divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          <div className="p-4 flex flex-col justify-between">
            <div className="text-sm text-gray-600 mb-3">Create a new payment request</div>
            <button
              onClick={() => router.push('/admin/invoices')}
              className="self-start px-3 py-1.5 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              Request payment ▾
            </button>
          </div>
          <button onClick={() => setBucketFilter('all')} className="p-4 text-left hover:bg-gray-50 border-t-2 border-t-amber-400">
            <div className="text-xs text-gray-500 mb-1">Not paid</div>
            <div className="text-xl font-semibold text-gray-900">{formatCents(funnel.notPaidTotal)}</div>
            <div className="text-xs text-amber-700 mt-1">⏱ {funnel.notPaidCount} overdue invoice{funnel.notPaidCount === 1 ? '' : 's'}</div>
          </button>
          <a href="/admin/invoices?status=paid" className="p-4 text-left hover:bg-gray-50 border-t-2 border-t-emerald-500">
            <div className="text-xs text-gray-500 mb-1">Paid</div>
            <div className="text-xl font-semibold text-gray-900">{formatCents(funnel.paidTotal)}</div>
            <div className="text-xs text-emerald-700 mt-1">✓ {funnel.paidCount} paid</div>
          </a>
          <div className="p-4 text-left border-t-2 border-t-emerald-600">
            <div className="text-xs text-gray-500 mb-1">Deposited</div>
            <div className="text-xl font-semibold text-gray-900">{formatCents(funnel.depositedTotal)}</div>
            <div className="text-xs text-emerald-700 mt-1">✓ {funnel.depositedCount} deposited</div>
          </div>
        </div>
      </div>

      {/* Income over time */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
          <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium">Income over time</div>
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span>This month</span>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={compareLastYear} onChange={(e) => setCompareLastYear(e.target.checked)} />
              Compare to previous year
            </label>
          </div>
        </div>
        <div className="text-2xl font-semibold text-gray-900">{formatCents(incomeThisMonth)} <span className="text-sm font-normal text-gray-500">this month</span></div>
        <div className="h-56 mt-3">
          {incomeChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">No paid invoices in the last 30 days.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={incomeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, 'Income']} />
                <Area type="monotone" dataKey="amount" stroke="#059669" strokeWidth={2} fill="url(#incomeFill)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Aging summary */}
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Total outstanding: <span className="text-gray-900">{formatCents(totalOutstanding)}</span></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {BUCKET_ORDER.map((b) => (
            <Kpi
              key={b}
              label={AGING_BUCKET_LABELS[b]}
              value={formatCents(bucketTotals[b])}
              accent={BUCKET_ACCENT[b]}
              onClick={() => setBucketFilter(bucketFilter === b ? 'all' : b)}
            />
          ))}
        </div>
      </div>

      {/* Outstanding by advertiser */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-medium">Outstanding by partner</div>
        {byAdvertiser.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">Nothing outstanding.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {byAdvertiser.map((a) => (
              <div key={a.name} className="grid grid-cols-2 sm:grid-cols-6 gap-2 px-4 py-3 text-sm items-center">
                <div className="col-span-2 font-medium text-gray-900 truncate">{a.name}</div>
                <div className="text-gray-900 font-semibold">{formatCents(a.total)}</div>
                <div className="hidden sm:block text-xs text-gray-500">{formatCents(a.buckets.d1_30)} (1-30d)</div>
                <div className="hidden sm:block text-xs text-gray-500">{formatCents(a.buckets.d31_60)} (31-60d)</div>
                <div className="hidden sm:block text-xs text-rose-600">{formatCents(a.buckets.d61_90 + a.buckets.d90_plus)} (60d+)</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unpaid invoice list (filterable by bucket) */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-gray-500 font-medium">
            Unpaid invoices {bucketFilter !== 'all' && `· ${AGING_BUCKET_LABELS[bucketFilter]}`}
          </div>
          {bucketFilter !== 'all' && (
            <button onClick={() => setBucketFilter('all')} className="text-xs text-blue-600 hover:text-blue-700">Clear filter</button>
          )}
        </div>
        {filteredUnpaid.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No unpaid invoices{bucketFilter !== 'all' ? ' in this bucket' : ''}.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredUnpaid.map((inv) => (
              <div key={inv.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                <div className="sm:col-span-2 font-mono text-gray-700">{inv.number ?? '—'}</div>
                <div className="sm:col-span-3 truncate text-gray-900">{inv.advertiser_name ?? '—'}</div>
                <div className="sm:col-span-2 text-gray-900">{formatCents(inv.total_cents)}</div>
                <div className="sm:col-span-2 text-xs text-gray-600">
                  {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : 'No due date'}
                </div>
                <div className="sm:col-span-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border ${inv.days > 0 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                    {inv.days > 0 ? `${inv.days}d overdue` : 'Not yet due'}
                  </span>
                </div>
                <div className="sm:col-span-1 text-right">
                  <button
                    onClick={() => handleGetPaymentLink(inv)}
                    disabled={busyId === inv.id}
                    className="text-xs px-2 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    {busyId === inv.id ? '…' : 'Send link'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recurring schedules */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 font-medium">Recurring invoice schedules</div>
        {schedules.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No recurring schedules yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {schedules.map((s) => (
              <div key={s.id} className="grid grid-cols-2 sm:grid-cols-12 gap-2 px-4 py-3 text-sm items-center">
                <div className="sm:col-span-3 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{s.name}</div>
                  <div className="text-xs text-gray-500 truncate">{s.advertiser_name ?? '—'} {s.source === 'agreement' ? '· linked to agreement' : '· standalone'}</div>
                </div>
                <div className="sm:col-span-2 text-gray-900">{formatCents(s.amount_cents + s.tax_cents)}</div>
                <div className="sm:col-span-2 text-xs text-gray-600">{frequencyLabel(s.frequency)}{s.interval_count > 1 ? ` (x${s.interval_count})` : ''}</div>
                <div className="sm:col-span-2 text-xs text-gray-600">Next: {new Date(s.next_run_at).toLocaleDateString()}</div>
                <div className="sm:col-span-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs border ${
                    s.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : s.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>{s.status}</span>
                </div>
                <div className="sm:col-span-2 flex gap-1 justify-end flex-wrap">
                  <button onClick={() => setEditSchedule(s)} className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">Edit</button>
                  <button
                    onClick={() => handlePauseResume(s)}
                    disabled={busyId === s.id || s.status === 'ended'}
                    className="text-xs px-2 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {s.status === 'active' ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleGenerateNow(s)}
                    disabled={busyId === s.id || s.status !== 'active'}
                    className="text-xs px-2 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    Generate now
                  </button>
                  {s.status !== 'active' && (
                    <button
                      onClick={() => handleDeleteSchedule(s)}
                      disabled={busyId === s.id}
                      className="text-xs px-2 py-1 rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {createSchedule && (
        <RecurringScheduleDrawer
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setCreateSchedule(false)}
          onSaved={async () => { setCreateSchedule(false); await reloadAll(); }}
          onError={setError}
        />
      )}
      {editSchedule && (
        <RecurringScheduleDrawer
          existing={editSchedule}
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setEditSchedule(null)}
          onSaved={async () => { setEditSchedule(null); await reloadAll(); }}
          onError={setError}
        />
      )}
    </div>
  );
}
