'use client';

// app/admin/ar/ArClient.tsx
//
// Accounts Receivable dashboard: aging buckets, outstanding-by-advertiser,
// and the recurring-invoice schedule manager.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, agingBucketForDaysPastDue, AGING_BUCKET_LABELS, emptyAgingTotals, type AgingBucket } from '@/lib/invoices';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import { frequencyLabel } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { InvoiceDrawer } from '@/app/admin/billing/_components/InvoiceDrawer';
import { shortDate } from '@/app/admin/billing/_components/helpers';
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
const BUCKET_COLOR: Record<AgingBucket, string> = {
  current: 'bg-emerald-500',
  d1_30: 'bg-amber-300',
  d31_60: 'bg-orange-400',
  d61_90: 'bg-orange-600',
  d90_plus: 'bg-rose-700',
};

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const ORANGE_BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50';

function Pagination({
  count,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const first = count ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, count);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-2.5 text-xs text-gray-700">
      <span>{count ? `${first}–${last} of ${count}` : '0 results'}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1">
          Rows
          <select
            className="rounded border border-gray-300 bg-white px-1 py-1"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <button type="button" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={page === 1} onClick={() => onPageChange(1)}>First</button>
        <button type="button" aria-label="Previous page" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" aria-label="Next page" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}><ChevronRight className="h-4 w-4" /></button>
        <button type="button" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={page === totalPages} onClick={() => onPageChange(totalPages)}>Last</button>
      </div>
    </div>
  );
}

function daysPastDue(dueDate: string | null): number {
  if (!dueDate) return -9999; // no due date yet ⇒ treat as current
  const due = new Date(dueDate).getTime();
  if (!Number.isFinite(due)) return -9999;
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
  const [editInvoice, setEditInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<'payment-link' | 'sales-receipt' | 'record-payment' | 'create-partner' | null>(null);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [invoicePage, setInvoicePage] = useState(1);
  const [partnerPage, setPartnerPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);

  const openQuickAction = (action: (typeof QUICK_ACTIONS)[number]['action']) => {
    if (action === 'recurring') setCreateSchedule(true);
    else {
      setPaymentInvoiceId(null);
      setPaymentAction(action);
    }
  };

  const openRecordPayment = (invoice: InvoiceWithAdvertiser) => {
    setEditInvoice(null);
    setPaymentInvoiceId(invoice.id);
    setPaymentAction('record-payment');
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
      const amt = inv.balance_cents ?? inv.total_cents ?? 0;
      if (amt <= 0) continue;
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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUnpaid = useMemo(() => unpaidInvoices.filter((invoice) => {
    if (bucketFilter !== 'all' && invoice.bucket !== bucketFilter) return false;
    if (!normalizedQuery) return true;
    return [
      invoice.number,
      invoice.advertiser_name,
      invoice.bill_to_name,
      invoice.bill_to_email,
      invoice.memo,
    ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery);
  }), [unpaidInvoices, bucketFilter, normalizedQuery]);
  const filteredAdvertisers = useMemo(
    () => normalizedQuery
      ? byAdvertiser.filter((advertiser) => advertiser.name.toLowerCase().includes(normalizedQuery))
      : byAdvertiser,
    [byAdvertiser, normalizedQuery],
  );
  const filteredSchedules = useMemo(
    () => normalizedQuery
      ? schedules.filter((schedule) => [
          schedule.name,
          schedule.advertiser_name,
          schedule.status,
          schedule.source,
        ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
      : schedules,
    [normalizedQuery, schedules],
  );
  const paginate = <T,>(rows: T[], page: number) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    return {
      rows: rows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
      currentPage,
      totalPages,
    };
  };
  const invoicePagination = paginate(filteredUnpaid, invoicePage);
  const partnerPagination = paginate(filteredAdvertisers, partnerPage);
  const schedulePagination = paginate(filteredSchedules, schedulePage);

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
        notPaidTotal += inv.balance_cents ?? inv.total_cents ?? 0;
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
    const previousBounds = {
      start: new Date(bounds.start),
      end: new Date(bounds.end),
    };
    previousBounds.start.setUTCFullYear(previousBounds.start.getUTCFullYear() - 1);
    previousBounds.end.setUTCFullYear(previousBounds.end.getUTCFullYear() - 1);

    const normalized = incomeByDay.map((row) => ({
      day: row.day,
      total_cents: Number(row.total_cents) || 0,
      date: new Date(`${row.day}T00:00:00Z`),
    }));
    const rows = normalized.filter((d) => {
      const day = d.date;
      return day >= bounds.start && day <= bounds.end;
    });
    const previousRows = normalized.filter((d) => {
      const day = new Date(d.day + 'T00:00:00Z');
      return day >= previousBounds.start && day <= previousBounds.end;
    });

    const points = new Map<string, { amount: number; previousAmount: number }>();
    for (const row of rows) {
      points.set(row.day, {
        amount: row.total_cents / 100,
        previousAmount: points.get(row.day)?.previousAmount ?? 0,
      });
    }
    for (const row of previousRows) {
      const projected = new Date(row.date);
      projected.setUTCFullYear(projected.getUTCFullYear() + 1);
      const key = projected.toISOString().slice(0, 10);
      points.set(key, {
        amount: points.get(key)?.amount ?? 0,
        previousAmount: row.total_cents / 100,
      });
    }

    return {
      chartData: [...points.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, values]) => ({
          day: new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          ...values,
        })),
      total: rows.reduce((sum, d) => sum + d.total_cents, 0),
      previousTotal: previousRows.reduce((sum, d) => sum + d.total_cents, 0),
    };
  }, [incomeByDay, incomePeriod]);

  const overdueCount = useMemo(() => unpaidInvoices.filter((i) => i.days > 0).length, [unpaidInvoices]);
  const overdueTotal = useMemo(
    () => unpaidInvoices.filter((i) => i.days > 0).reduce((s, i) => s + (i.balance_cents ?? i.total_cents ?? 0), 0),
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
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Get Paid</div>
          <PageTitle size="md">Accounts receivable</PageTitle>
        </div>
        <a href="/admin/invoices" className="text-sm font-medium text-orange-700 hover:underline">All invoices</a>
      </header>

      {(error || notice) && (
        <div role="status" className={`rounded border px-4 py-2 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
          {error || notice}
        </div>
      )}

      <section aria-label="Create actions" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="text-sm font-semibold text-gray-800">Create actions</div>
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              type="button"
              key={action.label}
              onClick={() => openQuickAction(action.action)}
              className="whitespace-nowrap rounded-full border border-orange-200 px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Receivables summary" className="grid gap-8 bg-white lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-gray-800">{formatCents(totalOutstanding)} outstanding</div>
            <span className="text-xs text-gray-500">{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? '' : 's'}</span>
          </div>
          <div className="grid grid-cols-2 gap-y-3 sm:grid-cols-5">
            {BUCKET_ORDER.map((bucket) => (
              <button
                type="button"
                key={bucket}
                onClick={() => { setBucketFilter(bucketFilter === bucket ? 'all' : bucket); setInvoicePage(1); }}
                className={`min-w-0 px-3 py-1 text-left first:pl-0 hover:bg-orange-50 ${bucketFilter === bucket ? 'bg-orange-50' : ''}`}
              >
                <div className="truncate text-lg font-semibold leading-tight text-gray-900">{formatCents(bucketTotals[bucket])}</div>
                <div className="mt-0.5 truncate text-xs text-gray-600">{AGING_BUCKET_LABELS[bucket]}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-label="Outstanding balance by aging bucket">
            {BUCKET_ORDER.map((bucket) => bucketTotals[bucket] > 0 && (
              <div
                key={bucket}
                className={BUCKET_COLOR[bucket]}
                style={{ width: `${(bucketTotals[bucket] / totalOutstanding) * 100}%` }}
                title={`${AGING_BUCKET_LABELS[bucket]}: ${formatCents(bucketTotals[bucket])}`}
              />
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold text-gray-800">Payments this month</div>
          <div className="grid grid-cols-3">
            {[
              [funnel.notPaidTotal, funnel.notPaidCount, 'not paid'],
              [funnel.paidTotal, funnel.paidCount, 'paid'],
              [funnel.depositedTotal, funnel.depositedCount, 'deposited'],
            ].map(([amount, count, label], index) => (
              <div key={label} className={`min-w-0 px-3 py-1 ${index ? 'border-l border-gray-200' : 'pl-0'}`}>
                <div className="truncate text-lg font-semibold leading-tight text-gray-900">{formatCents(amount as number)}</div>
                <div className="mt-0.5 truncate text-xs text-gray-600">{count} {label}</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
            <div className="bg-orange-500" style={{ width: `${funnel.notPaidTotal + funnel.paidTotal ? (funnel.notPaidTotal / (funnel.notPaidTotal + funnel.paidTotal)) * 100 : 0}%` }} />
            <div className="flex-1 bg-emerald-600" />
          </div>
        </div>
      </section>

      {!feedDismissed && overdueCount > 0 && (
        <aside className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-gray-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
          <span className="font-semibold">Overdue invoices</span>
          <span className="text-gray-600">{formatCents(overdueTotal)} in reminders is ready to review.</span>
          <button type="button" onClick={() => { setBucketFilter('d1_30'); setInvoicePage(1); }} className="font-medium text-orange-700 hover:underline">Review all</button>
          <button type="button" onClick={() => setFeedDismissed(true)} className="ml-auto rounded p-1 text-gray-500 hover:bg-orange-100" aria-label="Dismiss overdue reminder"><X className="h-4 w-4" /></button>
        </aside>
      )}

      <section aria-label="Accounts receivable filters" className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search receivables</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              className={`${CONTROL} w-full pl-9`}
              placeholder="Invoice, partner, email, or schedule"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setInvoicePage(1); setPartnerPage(1); setSchedulePage(1); }}
            />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Aging</span>
          <select className={`${CONTROL} min-w-40`} value={bucketFilter} onChange={(event) => { setBucketFilter(event.target.value as AgingBucket | 'all'); setInvoicePage(1); }}>
            <option value="all">All aging buckets</option>
            {BUCKET_ORDER.map((bucket) => <option key={bucket} value={bucket}>{AGING_BUCKET_LABELS[bucket]}</option>)}
          </select>
        </label>
        <div className="relative ml-auto flex">
          <button type="button" className={`${ORANGE_BUTTON} rounded-r-none`} onClick={() => setCreateInvoice(true)}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Create invoice
          </button>
          <button type="button" aria-label="More create actions" aria-expanded={requestMenuOpen} className={`${ORANGE_BUTTON} -ml-px rounded-l-none px-2`} onClick={() => setRequestMenuOpen((open) => !open)}>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          {requestMenuOpen && (
            <div role="menu" className="absolute right-0 top-10 z-40 w-60 rounded border border-gray-200 bg-white py-1 shadow-lg">
              {QUICK_ACTIONS.map((action) => (
                <button type="button" role="menuitem" key={action.label} className="block w-full px-4 py-2 text-left text-sm text-gray-800 hover:bg-gray-50" onClick={() => { setRequestMenuOpen(false); openQuickAction(action.action); }}>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Unpaid invoices</h2>
            <p className="mt-0.5 text-xs text-gray-500">{bucketFilter === 'all' ? 'All open balances' : AGING_BUCKET_LABELS[bucketFilter]}</p>
          </div>
          {bucketFilter !== 'all' && <button type="button" onClick={() => { setBucketFilter('all'); setInvoicePage(1); }} className="text-xs font-medium text-orange-700 hover:underline">Clear filter</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <th className="w-32 px-4 py-3 font-semibold">Invoice</th>
                <th className="w-64 px-3 py-3 font-semibold">Partner</th>
                <th className="w-32 px-3 py-3 text-right font-semibold">Balance</th>
                <th className="w-32 px-3 py-3 font-semibold">Due date</th>
                <th className="w-40 px-3 py-3 font-semibold">Aging status</th>
                <th className="w-80 px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoicePagination.rows.map((invoice) => (
                <tr
                  key={invoice.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${invoice.number ?? 'draft invoice'} for ${invoice.advertiser_name ?? invoice.bill_to_name ?? 'partner'}`}
                  onClick={() => setEditInvoice(invoice)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setEditInvoice(invoice);
                    }
                  }}
                  className="cursor-pointer hover:bg-orange-50/70 focus:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-400"
                >
                  <td className="truncate px-4 py-2.5 font-semibold text-orange-700 underline decoration-orange-200 underline-offset-2">{invoice.number ?? 'Draft'}</td>
                  <td className="truncate px-3 py-2.5 text-gray-800">{invoice.advertiser_name ?? invoice.bill_to_name ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">{formatCents(invoice.balance_cents ?? invoice.total_cents)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{invoice.due_date ? shortDate(invoice.due_date) : 'No due date'}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
                      {invoice.days > 0 ? <AlertCircle className="h-4 w-4 text-orange-600" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                      {invoice.days > 0 ? `${invoice.days} days overdue` : 'Not due yet'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={(event) => { event.stopPropagation(); setEditInvoice(invoice); }} onKeyDown={(event) => event.stopPropagation()} className="font-medium text-gray-700 hover:text-orange-700 hover:underline">
                      Edit
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); openRecordPayment(invoice); }} onKeyDown={(event) => event.stopPropagation()} className="font-medium text-gray-700 hover:text-orange-700 hover:underline">
                      Record payment
                    </button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); void handleGetPaymentLink(invoice); }} onKeyDown={(event) => event.stopPropagation()} disabled={busyId === invoice.id} className="font-medium text-orange-700 hover:underline disabled:opacity-50">
                      {busyId === invoice.id ? 'Sending…' : 'Send payment link'}
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invoicePagination.rows.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No unpaid invoices match these filters.</div>}
        <Pagination count={filteredUnpaid.length} page={invoicePagination.currentPage} pageSize={pageSize} totalPages={invoicePagination.totalPages} onPageChange={setInvoicePage} onPageSizeChange={(size) => { setPageSize(size); setInvoicePage(1); setPartnerPage(1); setSchedulePage(1); }} />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="min-w-0 overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-300 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Outstanding by partner</h2>
            <p className="mt-0.5 text-xs text-gray-500">Open balances by aging range</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[660px] table-fixed text-left text-xs">
              <thead className="border-b border-gray-300 text-gray-700">
                <tr>
                  <th className="w-48 px-4 py-3 font-semibold">Partner</th>
                  <th className="w-28 px-2 py-3 text-right font-semibold">Total</th>
                  <th className="w-28 px-2 py-3 text-right font-semibold">1–30</th>
                  <th className="w-28 px-2 py-3 text-right font-semibold">31–60</th>
                  <th className="w-28 px-4 py-3 text-right font-semibold">60+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {partnerPagination.rows.map((advertiser) => (
                  <tr key={advertiser.name} className="hover:bg-orange-50/40">
                    <td className="truncate px-4 py-2.5 font-medium text-gray-800">{advertiser.name}</td>
                    <td className="px-2 py-2.5 text-right font-medium tabular-nums text-gray-900">{formatCents(advertiser.total)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{formatCents(advertiser.buckets.d1_30)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{formatCents(advertiser.buckets.d31_60)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-orange-700">{formatCents(advertiser.buckets.d61_90 + advertiser.buckets.d90_plus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {partnerPagination.rows.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No outstanding partner balances match.</div>}
          <Pagination count={filteredAdvertisers.length} page={partnerPagination.currentPage} pageSize={pageSize} totalPages={partnerPagination.totalPages} onPageChange={setPartnerPage} onPageSizeChange={(size) => { setPageSize(size); setInvoicePage(1); setPartnerPage(1); setSchedulePage(1); }} />
        </div>

        <div className="min-w-0 overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Income over time</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {formatCents(selectedIncome.total)} · {selectedIncomeLabel}
                {compareLastYear ? ` · ${formatCents(selectedIncome.previousTotal)} previous year` : ''}
              </p>
            </div>
            <div className="relative">
              <button type="button" onClick={() => setDurationMenuOpen((open) => !open)} aria-expanded={durationMenuOpen} aria-haspopup="listbox" className="inline-flex h-8 items-center gap-2 rounded border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50">
                {selectedIncomeLabel}<ChevronDown className="h-3.5 w-3.5" />
              </button>
              {durationMenuOpen && (
                <div role="listbox" className="absolute right-0 top-9 z-30 max-h-80 min-w-64 overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg">
                  {INCOME_PERIODS.map(([value, label]) => (
                    <button type="button" role="option" aria-selected={incomePeriod === value} key={value} onClick={() => { setIncomePeriod(value); setDurationMenuOpen(false); }} className={`block w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${incomePeriod === value ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{label}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 px-4 pt-3 text-xs text-gray-600">
            <input type="checkbox" checked={compareLastYear} onChange={(event) => setCompareLastYear(event.target.checked)} />
            Compare to previous year
          </label>
          <div className="h-48 px-2 pb-3 pt-2">
            {selectedIncome.chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">No paid invoices for this period.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={selectedIncome.chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#059669" stopOpacity={0.2} /><stop offset="95%" stopColor="#059669" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value}`} width={48} />
                  <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Income']} />
                  <Area type="monotone" dataKey="amount" stroke="#059669" strokeWidth={2} fill="url(#incomeFill)" />
                  {compareLastYear && (
                    <Area
                      type="monotone"
                      dataKey="previousAmount"
                      name="Previous year"
                      stroke="#9ca3af"
                      strokeDasharray="5 4"
                      strokeWidth={2}
                      fill="none"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-300 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recurring invoice schedules</h2>
            <p className="mt-0.5 text-xs text-gray-500">Automated billing and next run dates</p>
          </div>
          <button type="button" className={ORANGE_BUTTON} onClick={() => setCreateSchedule(true)}>Create schedule</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left text-xs">
            <thead className="border-b border-gray-300 text-gray-700">
              <tr>
                <th className="w-64 px-4 py-3 font-semibold">Schedule</th>
                <th className="w-36 px-3 py-3 text-right font-semibold">Amount</th>
                <th className="w-36 px-3 py-3 font-semibold">Frequency</th>
                <th className="w-36 px-3 py-3 font-semibold">Next run</th>
                <th className="w-24 px-3 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schedulePagination.rows.map((schedule) => (
                <tr key={schedule.id} className="hover:bg-orange-50/40">
                  <td className="px-4 py-2.5"><div className="truncate font-medium text-gray-900">{schedule.name}</div><div className="truncate text-gray-500">{schedule.advertiser_name ?? '—'} · {schedule.source === 'agreement' ? 'linked to agreement' : 'standalone'}</div></td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-gray-900">{formatCents(schedule.amount_cents + schedule.tax_cents)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{frequencyLabel(schedule.frequency)}{schedule.interval_count > 1 ? ` (x${schedule.interval_count})` : ''}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{new Date(schedule.next_run_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${schedule.status === 'active' ? 'text-emerald-700' : schedule.status === 'paused' ? 'text-orange-700' : 'text-gray-600'}`}><span className={`h-2 w-2 rounded-full ${schedule.status === 'active' ? 'bg-emerald-600' : schedule.status === 'paused' ? 'bg-orange-500' : 'bg-gray-400'}`} />{schedule.status}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button type="button" onClick={() => setEditSchedule(schedule)} className="font-medium text-orange-700 hover:underline">Edit</button>
                    <button type="button" onClick={() => handlePauseResume(schedule)} disabled={busyId === schedule.id || schedule.status === 'ended'} className="ml-3 font-medium text-orange-700 hover:underline disabled:text-gray-400 disabled:no-underline">{schedule.status === 'active' ? 'Pause' : 'Resume'}</button>
                    <button type="button" onClick={() => handleGenerateNow(schedule)} disabled={busyId === schedule.id || schedule.status !== 'active'} className="ml-3 font-medium text-orange-700 hover:underline disabled:text-gray-400 disabled:no-underline">Generate now</button>
                    {schedule.status !== 'active' && <button type="button" onClick={() => handleDeleteSchedule(schedule)} disabled={busyId === schedule.id} className="ml-3 font-medium text-red-600 hover:underline disabled:opacity-50">Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {schedulePagination.rows.length === 0 && <div className="p-10 text-center text-sm text-gray-500">No recurring schedules match these filters.</div>}
        <Pagination count={filteredSchedules.length} page={schedulePagination.currentPage} pageSize={pageSize} totalPages={schedulePagination.totalPages} onPageChange={setSchedulePage} onPageSizeChange={(size) => { setPageSize(size); setInvoicePage(1); setPartnerPage(1); setSchedulePage(1); }} />
      </section>

      {createInvoice && (
        <InvoiceDrawer
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setCreateInvoice(false)}
          onSaved={async () => { setCreateInvoice(false); await reloadAll(); }}
          onError={setError}
        />
      )}
      {editInvoice && (
        <InvoiceDrawer
          existing={editInvoice}
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setEditInvoice(null)}
          onSaved={async () => { setEditInvoice(null); await reloadAll(); }}
          onRecordPayment={() => openRecordPayment(editInvoice)}
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
          initialInvoiceId={paymentInvoiceId ?? undefined}
          onClose={() => { setPaymentAction(null); setPaymentInvoiceId(null); }}
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
