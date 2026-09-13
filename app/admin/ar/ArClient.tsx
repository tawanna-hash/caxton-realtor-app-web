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
import { InvoiceDrawer } from '@/app/admin/billing/_components/InvoiceDrawer';
import PageTitle from '@/components/ui/PageTitle';
import { RecurringScheduleDrawer } from './RecurringScheduleDrawer';
import { PaymentLinkDrawer, RecordPaymentDrawer, SalesReceiptDrawer } from './PaymentActionDrawers';
import { CreatePartnerDrawer } from './CreatePartnerDrawer';

type Props = {
  initialInvoices: InvoiceWithAdvertiser[];
  initialSchedules: RecurringScheduleWithAdvertiser[];
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  incomeByDay: Array<{ day: string; total_cents: number }>;
};

const QUICK_ACTIONS = [
  { label: 'Get paid online', action: 'invoice' },
  { label: 'Create invoice', action: 'invoice' },
  { label: 'Create payment link', action: 'payment-link' },
  { label: 'Create recurring payment', action: 'recurring' },
  { label: 'Create sales receipt', action: 'sales-receipt' },
  { label: 'Record payment', action: 'record-payment' },
  { label: 'Create partner', action: 'create-partner' },
] as const;

const INCOME_PERIODS = [
  ['last-year', 'Last year'],
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['this-month-to-date', 'This month to date'],
  ['this-quarter', 'This quarter'],
  ['last-quarter', 'Last quarter'],
  ['this-quarter-to-date', 'This quarter to date'],
  ['last-12-months', 'Last 12 months'],
  ['this-fiscal-year-to-date', 'This fiscal year to date'],
  ['this-year-to-date', 'This year to date'],
  ['this-fiscal-year-to-last-month', 'This fiscal year to last month'],
  ['this-year-to-last-month', 'This year to last month'],
  ['this-fiscal-year', 'This fiscal year'],
  ['this-year', 'This year'],
  ['last-fiscal-year', 'Last fiscal year'],
] as const;

type IncomePeriod = (typeof INCOME_PERIODS)[number][0];

function incomePeriodBounds(period: IncomePeriod, now = new Date()): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const today = new Date(Date.UTC(year, month, now.getUTCDate(), 23, 59, 59, 999));
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const quarterMonth = Math.floor(month / 3) * 3;
  const startOfQuarter = new Date(Date.UTC(year, quarterMonth, 1));
  const endOfQuarter = new Date(Date.UTC(year, quarterMonth + 3, 0, 23, 59, 59, 999));

  switch (period) {
    case 'last-year':
    case 'last-fiscal-year':
      return { start: new Date(Date.UTC(year - 1, 0, 1)), end: new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999)) };
    case 'last-month':
      return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) };
    case 'this-month-to-date':
      return { start: startOfMonth, end: today };
    case 'this-quarter':
      return { start: startOfQuarter, end: endOfQuarter };
    case 'last-quarter':
      return { start: new Date(Date.UTC(year, quarterMonth - 3, 1)), end: new Date(Date.UTC(year, quarterMonth, 0, 23, 59, 59, 999)) };
    case 'this-quarter-to-date':
      return { start: startOfQuarter, end: today };
    case 'last-12-months':
      return { start: new Date(Date.UTC(year, month - 11, 1)), end: today };
    case 'this-fiscal-year-to-date':
    case 'this-year-to-date':
      return { start: new Date(Date.UTC(year, 0, 1)), end: today };
    case 'this-fiscal-year-to-last-month':
    case 'this-year-to-last-month':
      return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)) };
    case 'this-fiscal-year':
    case 'this-year':
      return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
    case 'this-month':
    default:
      return { start: startOfMonth, end: endOfMonth };
  }
}

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
  const [requestMenuOpen, setRequestMenuOpen] = useState(false);
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [incomePeriod, setIncomePeriod] = useState<IncomePeriod>('this-month');
  const [createInvoice, setCreateInvoice] = useState(false);
  const [paymentAction, setPaymentAction] = useState<'payment-link' | 'sales-receipt' | 'record-payment' | 'create-partner' | null>(null);

  const openQuickAction = (action: (typeof QUICK_ACTIONS)[number]['action']) => {
    if (action === 'invoice') setCreateInvoice(true);
    else if (action === 'recurring') setCreateSchedule(true);
    else setPaymentAction(action);
  };

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

  const selectedIncomeLabel = INCOME_PERIODS.find(([value]) => value === incomePeriod)?.[1] ?? 'This month';
  const selectedIncome = useMemo(() => {
    const bounds = incomePeriodBounds(incomePeriod);
    const rows = incomeByDay.filter((d) => {
      const day = new Date(d.day + 'T00:00:00Z');
      return day >= bounds.start && day <= bounds.end;
    });
    return {
      chartData: rows.map((d) => ({
        day: new Date(d.day + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: (d.total_cents ?? 0) / 100,
      })),
      total: rows.reduce((sum, d) => sum + (d.total_cents ?? 0), 0),
    };
  }, [incomeByDay, incomePeriod]);

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
              className="text-sm text-orange-700 hover:text-orange-800 font-medium mt-2"
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
          {QUICK_ACTIONS.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={() => openQuickAction(action.action)}
              className="px-3 py-1.5 rounded-full border border-orange-200 text-sm text-orange-700 hover:bg-orange-50 whitespace-nowrap"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sales & Get Paid funnel */}
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">Sales &amp; Get Paid at a glance</div>
        <div className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-2">Sales &amp; Get Paid funnel</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-0 sm:gap-0 rounded-lg border border-gray-200 overflow-visible bg-white divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
          <div className="p-4 flex flex-col justify-between relative">
            <div className="text-sm text-gray-600 mb-3">Create a new payment request</div>
            <button
              type="button"
              onClick={() => setRequestMenuOpen((open) => !open)}
              aria-expanded={requestMenuOpen}
              aria-haspopup="menu"
              className="self-start px-3 py-1.5 rounded-md border border-orange-200 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              Request payment <span aria-hidden="true">⌄</span>
            </button>
            {requestMenuOpen && (
              <div role="menu" className="absolute left-4 top-[82px] z-30 min-w-52 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                {QUICK_ACTIONS.filter((action) => action.action !== 'create-partner').map((action) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={action.label}
                    onClick={() => {
                      setRequestMenuOpen(false);
                      openQuickAction(action.action);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setDurationMenuOpen((open) => !open)}
                aria-expanded={durationMenuOpen}
                aria-haspopup="listbox"
                className="inline-flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
              >
                <span className="text-gray-400">Duration:</span>
                <span>{selectedIncomeLabel}</span>
                <span aria-hidden="true">⌄</span>
              </button>
              {durationMenuOpen && (
                <div role="listbox" className="absolute right-0 top-full z-30 mt-1 max-h-80 min-w-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                  {INCOME_PERIODS.map(([value, label]) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={incomePeriod === value}
                      key={value}
                      onClick={() => {
                        setIncomePeriod(value);
                        setDurationMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
                        incomePeriod === value ? 'font-medium text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      <span className="w-3" aria-hidden="true">{incomePeriod === value ? '✓' : ''}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={compareLastYear} onChange={(e) => setCompareLastYear(e.target.checked)} />
              Compare to previous year
            </label>
          </div>
        </div>
        <div className="text-2xl font-semibold text-gray-900">{formatCents(selectedIncome.total)} <span className="text-sm font-normal text-gray-500">{selectedIncomeLabel.toLowerCase()}</span></div>
        <div className="h-56 mt-3">
          {selectedIncome.chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-400">No paid invoices for {selectedIncomeLabel.toLowerCase()}.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selectedIncome.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={48} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Income']} />
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
            <button onClick={() => setBucketFilter('all')} className="text-xs text-orange-600 hover:text-orange-700">Clear filter</button>
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
                    className="text-xs px-2 py-1 rounded-md border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50 whitespace-nowrap"
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
                    className="text-xs px-2 py-1 rounded-md border border-orange-200 text-orange-700 hover:bg-orange-50 disabled:opacity-50"
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

      {createInvoice && (
        <InvoiceDrawer
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setCreateInvoice(false)}
          onSaved={async () => { setCreateInvoice(false); await reloadAll(); }}
          onError={setError}
        />
      )}
      {paymentAction === 'payment-link' && (
        <PaymentLinkDrawer
          invoices={invoices}
          advertisers={advertisers}
          onClose={() => setPaymentAction(null)}
          onSaved={reloadAll}
          onError={setError}
        />
      )}
      {paymentAction === 'sales-receipt' && (
        <SalesReceiptDrawer
          invoices={invoices}
          advertisers={advertisers}
          onClose={() => setPaymentAction(null)}
          onSaved={reloadAll}
          onError={setError}
        />
      )}
      {paymentAction === 'record-payment' && (
        <RecordPaymentDrawer
          invoices={invoices}
          advertisers={advertisers}
          onClose={() => setPaymentAction(null)}
          onSaved={reloadAll}
          onError={setError}
        />
      )}
      {paymentAction === 'create-partner' && (
        <CreatePartnerDrawer
          onClose={() => setPaymentAction(null)}
          onSaved={() => router.refresh()}
          onError={setError}
        />
      )}
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
