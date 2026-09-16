'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Printer,
  Search,
  Sparkles,
} from 'lucide-react';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { InvoiceDrawer } from '@/app/admin/billing/_components/InvoiceDrawer';
import {
  PaymentLinkDrawer,
  RecordPaymentDrawer,
  SalesReceiptDrawer,
} from '@/app/admin/ar/PaymentActionDrawers';
import { RecurringScheduleDrawer } from '@/app/admin/ar/RecurringScheduleDrawer';
import PageTitle from '@/components/ui/PageTitle';
import { toISODateString } from '@/app/admin/billing/_components/helpers';

export type SalesTransactionsClientProps = {
  initialInvoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  referenceDate: string;
  workspace?: 'sales' | 'invoices';
  initialCreate?: boolean;
  initialEdit?: InvoiceWithAdvertiser | null;
  invoiceSeed?: {
    advertiser_id: number | null;
    agreement_id: string;
    amount_cents: number | null;
  } | null;
  onConsumeUrlSeed?: () => void;
};

type DateFilter = 'all' | '30-days' | '3-months' | '12-months';
type TypeFilter = 'all' | 'invoice' | 'receipt' | 'payment';
type StatusFilter = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'void';
type DeliveryFilter = 'all' | 'email' | 'not-sent';
type ErrorFilter = 'all' | 'missing-email' | 'past-due';
type BatchAction = 'send' | 'remind' | 'print' | 'void' | 'delete';
type SortKey = 'date' | 'billing_date' | 'payment_received' | 'type' | 'number' | 'client' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';
type EmailDraft = {
  invoice: InvoiceWithAdvertiser;
  reminder: boolean;
};
type InvoiceSender =
  | 'tawanna@myrealtyline.com'
  | 'tawanna@newslinesa.com'
  | 'hello@myrealtyline.com';

const CONTROL =
  'h-9 rounded border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100';
const ORANGE_BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50';

function formatTransactionDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const [year, month, day] = toISODateString(value).split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  }).format(new Date(year, month - 1, day));
}

function transactionDate(invoice: InvoiceWithAdvertiser) {
  return invoice.paid_at ?? invoice.issued_at ?? invoice.created_at;
}

/** The actual date payment was received, from the payment record(s) — not
 * the invoice's `paid_at` stamp, which is only set once and can go stale
 * if a payment's date is edited afterward. Falls back to `paid_at` for
 * invoices without a loaded payments array. */
function paymentReceivedDate(invoice: InvoiceWithAdvertiser) {
  const payments = invoice.payments;
  if (payments && payments.length) {
    const latest = payments.reduce<string | null>((latestDate, payment) => {
      if (!payment.payment_date) return latestDate;
      if (!latestDate || payment.payment_date > latestDate) return payment.payment_date;
      return latestDate;
    }, null);
    if (latest) return latest;
  }
  return invoice.paid_at;
}

function transactionType(invoice: InvoiceWithAdvertiser): Exclude<TypeFilter, 'all'> {
  if (invoice.number?.startsWith('SR-')) return 'receipt';
  if (invoice.status === 'paid') return 'payment';
  return 'invoice';
}

function transactionTypeLabel(invoice: InvoiceWithAdvertiser) {
  const type = transactionType(invoice);
  if (type === 'receipt') return 'Sales receipt';
  if (type === 'payment') return 'Payment';
  return 'Invoice';
}

function daysOverdue(invoice: InvoiceWithAdvertiser, referenceTime: number) {
  if (!invoice.due_date) return 0;
  const due = new Date(`${toISODateString(invoice.due_date)}T12:00:00`);
  return Math.max(1, Math.floor((referenceTime - due.getTime()) / 86_400_000));
}

function statusLabel(invoice: InvoiceWithAdvertiser, referenceTime: number) {
  if (invoice.is_overdue) return `Overdue ${daysOverdue(invoice, referenceTime)} days`;
  if (invoice.status === 'paid') return 'Paid';
  if (invoice.status === 'sent') return 'Open';
  return invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
}

function memoSummary(invoice: InvoiceWithAdvertiser) {
  return (
    invoice.line_items
      ?.map((item) => item.description?.trim())
      .filter(Boolean)
      .join('; ') ||
    invoice.memo ||
    '—'
  );
}

function sortValue(invoice: InvoiceWithAdvertiser, key: SortKey, referenceTime: number): string | number {
  switch (key) {
    case 'date': {
      const value = transactionDate(invoice);
      return value ? new Date(value).getTime() : 0;
    }
    case 'billing_date': {
      const value = invoice.issued_at;
      return value ? new Date(value).getTime() : 0;
    }
    case 'payment_received': {
      const value = paymentReceivedDate(invoice);
      return value ? new Date(value).getTime() : 0;
    }
    case 'type':
      return transactionTypeLabel(invoice);
    case 'number':
      return invoice.number ?? '';
    case 'client':
      return (invoice.advertiser_name ?? invoice.bill_to_name ?? '').toLowerCase();
    case 'amount':
      return invoice.total_cents;
    case 'status':
      return statusLabel(invoice, referenceTime);
    default:
      return '';
  }
}

function inDateRange(invoice: InvoiceWithAdvertiser, filter: DateFilter, referenceDate: Date) {
  if (filter === 'all') return true;
  const months = filter === '30-days' ? 1 : filter === '3-months' ? 3 : 12;
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - months);
  return new Date(transactionDate(invoice)).getTime() >= cutoff.getTime();
}

function SummaryMetric({
  amount,
  count,
  label,
}: {
  amount: number;
  count: number;
  label: string;
}) {
  return (
    <div className="min-w-0 px-3 py-1 first:pl-0">
      <div className="text-lg font-semibold leading-tight text-gray-900">{formatCents(amount)}</div>
      <div className="mt-0.5 truncate text-xs text-gray-600">
        {count.toLocaleString()} {label}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className = '',
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: 'left' | 'right';
}) {
  const isActive = activeKey === sortKey;
  const Icon = isActive ? (dir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`${className} px-2 py-3 font-semibold`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 text-left font-semibold hover:text-gray-900 ${align === 'right' ? 'justify-end' : ''} ${isActive ? 'text-gray-900' : 'text-gray-700'}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${isActive ? 'opacity-100' : 'opacity-40'}`} />
      </button>
    </th>
  );
}

function StatusCell({ invoice, referenceTime }: { invoice: InvoiceWithAdvertiser; referenceTime: number }) {
  if (invoice.is_overdue) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <AlertCircle className="h-4 w-4 text-orange-600" aria-hidden="true" />
        {statusLabel(invoice, referenceTime)}
      </span>
    );
  }
  if (invoice.status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-700">
        <CheckCircle2 className="h-4 w-4 fill-emerald-600 text-white" aria-hidden="true" />
        Paid
      </span>
    );
  }
  return <span className="whitespace-nowrap text-gray-700">{statusLabel(invoice, referenceTime)}</span>;
}

function EmailInvoiceDialog({
  draft,
  busy,
  referenceTime,
  onClose,
  onSend,
}: {
  draft: EmailDraft;
  busy: boolean;
  referenceTime: number;
  onClose: () => void;
  onSend: (values: { from: InvoiceSender; to: string; subject: string; message: string }) => void;
}) {
  const { invoice, reminder } = draft;
  const client = invoice.bill_to_name ?? invoice.advertiser_name ?? 'Customer';
  const [from, setFrom] = useState<InvoiceSender>(
    reminder ? 'tawanna@myrealtyline.com' : 'hello@myrealtyline.com',
  );
  const [to, setTo] = useState(invoice.bill_to_email ?? '');
  const [subject, setSubject] = useState(
    reminder
      ? `Reminder: Your payment to Caxton Publications Inc. is due`
      : `Invoice ${invoice.number ?? ''} from Caxton Publications, Inc.`,
  );
  const [body, setBody] = useState(
    reminder
      ? `Dear ${client},\n\nThis is a reminder that invoice ${invoice.number ?? ''} has not been paid. If you have any questions, please reach out to our office.\n\nSincerely,\nTawanna Verock\nCaxton Publications Inc.`
      : `Dear ${client},\n\nWe appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.\n\nSincerely,\nTawanna Verock\nCaxton Publications Inc.`,
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-label={reminder ? 'Review invoice reminder' : `Send invoice ${invoice.number}`}>
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{reminder ? 'Review invoice reminder' : `Send Invoice ${invoice.number ?? ''}`}</h2>
            {reminder && <p className="mt-1 text-xs text-gray-500">Review and edit the reminder before sending.</p>}
          </div>
          <button type="button" aria-label="Close email" className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>×</button>
        </div>
        <div className={`grid gap-6 p-6 ${reminder ? 'lg:grid-cols-[190px_1fr]' : 'lg:grid-cols-2'}`}>
          {reminder && (
            <aside className="rounded bg-gray-50 p-4 text-xs text-gray-700">
              <div className="font-semibold text-gray-900">About this customer</div>
              <ul className="mt-2 space-y-1">
                <li>Customer since {new Date(invoice.created_at).getFullYear()}</li>
                <li>{client}</li>
              </ul>
              <div className="mt-5 font-semibold text-gray-900">About this invoice</div>
              <ul className="mt-2 space-y-1">
                <li>Total amount: {formatCents(invoice.total_cents)}</li>
                <li>Remaining balance: {formatCents(invoice.total_cents)}</li>
                <li>{invoice.is_overdue ? `${daysOverdue(invoice, referenceTime)} days overdue` : 'Open invoice'}</li>
              </ul>
            </aside>
          )}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600">From
              <select
                className={`${CONTROL} mt-1 w-full`}
                value={from}
                onChange={(event) => setFrom(event.target.value as InvoiceSender)}
              >
                <option value="tawanna@myrealtyline.com">Tawanna Verock &lt;tawanna@myrealtyline.com&gt;</option>
                <option value="tawanna@newslinesa.com">Tawanna Verock &lt;tawanna@newslinesa.com&gt;</option>
                <option value="hello@myrealtyline.com">Caxton Publications Inc. &lt;hello@myrealtyline.com&gt;</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-600">To
              <input className={`${CONTROL} mt-1 w-full`} type="email" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label className="block text-xs font-medium text-gray-600">Subject
              <input className={`${CONTROL} mt-1 w-full`} value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="block text-xs font-medium text-gray-600">Message
              <textarea className="mt-1 min-h-48 w-full rounded border border-gray-300 p-3 text-sm leading-6 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" value={body} onChange={(event) => setBody(event.target.value)} />
            </label>
            {!reminder && (
              <div className="space-y-1 border-t border-gray-200 pt-3 text-xs font-medium text-gray-700">
                <div>Invoice PDF</div>
                <div>{memoSummary(invoice)}</div>
              </div>
            )}
          </div>
          {!reminder && (
            <div className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
              <div className="p-5 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/caxton-logo.jpg" alt="Caxton Publications" className="mx-auto h-24 w-auto object-contain" />
              </div>
              <div className="bg-blue-50 px-6 py-8 text-center">
                <div className="text-xl font-semibold text-gray-900">Your invoice is ready!</div>
                <div className="mt-5 text-xs uppercase tracking-wider text-gray-500">Balance due</div>
                <div className="mt-1 text-3xl font-semibold text-gray-900">{formatCents(invoice.total_cents)}</div>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <button type="button" className="text-sm font-medium text-gray-600 hover:text-gray-900" onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy || !to.trim() || !subject.trim()} className={ORANGE_BUTTON} onClick={() => onSend({ from, to, subject, message: body })}>{busy ? 'Sending…' : reminder ? 'Send reminder' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}

function ShareInvoiceDialog({
  invoice,
  onClose,
  onCreated,
  onError,
}: {
  invoice: InvoiceWithAdvertiser;
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState(!invoice.stripe_payment_link_url);
  const [url, setUrl] = useState(invoice.stripe_payment_link_url ?? '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (url) return;
    let alive = true;
    fetch(`/api/admin/invoices/${invoice.id}/payment-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ send_email: false }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? 'Could not create invoice link.');
        if (alive) {
          setUrl(data.checkout_url ?? data.portal_pay_url ?? '');
          await onCreated();
        }
      })
      .catch((value) => {
        if (alive) onError(value instanceof Error ? value.message : 'Could not create invoice link.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoice.id, onCreated, onError, url]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-label="Share invoice link">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold leading-tight text-gray-900">Send your customer a link to their invoice</h2>
            <p className="mt-3 text-sm leading-5 text-gray-600">Share an invoice link instead of an email. Your customer can view and pay online.</p>
          </div>
          <button type="button" aria-label="Close invoice link" className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={onClose}>×</button>
        </div>
        <div className="mt-5 min-h-10 rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {loading ? 'Creating secure link…' : url || 'Link could not be created.'}
        </div>
        <div className="mt-7 flex justify-end gap-2 border-t border-gray-200 pt-5">
          <button type="button" disabled={!url} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" className={ORANGE_BUTTON} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export function SalesTransactionsClient({
  initialInvoices,
  advertisers,
  agreements,
  referenceDate,
  workspace = 'sales',
  initialCreate = false,
  initialEdit = null,
  invoiceSeed = null,
  onConsumeUrlSeed,
}: SalesTransactionsClientProps) {
  const invoiceWorkspace = workspace === 'invoices';
  const stableReferenceDate = useMemo(() => new Date(referenceDate), [referenceDate]);
  const referenceTime = stableReferenceDate.getTime();
  const [invoices, setInvoices] = useState(initialInvoices);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>(invoiceWorkspace ? 'all' : '3-months');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [delivery, setDelivery] = useState<DeliveryFilter>('all');
  const [errors, setErrors] = useState<ErrorFilter>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(initialCreate);
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithAdvertiser | null>(initialEdit);
  const [paymentLinkInvoice, setPaymentLinkInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [shareInvoice, setShareInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [paymentInvoice, setPaymentInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [recurringInvoice, setRecurringInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [creatingReceipt, setCreatingReceipt] = useState(false);
  const [activityInvoice, setActivityInvoice] = useState<InvoiceWithAdvertiser | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if ((initialCreate || initialEdit) && onConsumeUrlSeed) onConsumeUrlSeed();
  }, [initialCreate, initialEdit, onConsumeUrlSeed]);

  const reload = async () => {
    const response = await fetch('/api/admin/invoices', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Could not refresh sales transactions.');
    setInvoices(data.invoices ?? []);
  };

  const saved = async () => {
    await reload();
    setCreatingInvoice(false);
    setEditingInvoice(null);
    setError('');
    setMessage('Sales transactions updated.');
  };

  const fail = (value: string) => {
    setError(value);
    if (value) setMessage('');
  };

  const summary = useMemo(() => {
    const open = invoices.filter((invoice) => !['paid', 'void', 'draft'].includes(invoice.status));
    const overdue = open.filter((invoice) => invoice.is_overdue);
    const paid = invoices.filter((invoice) => {
      if (invoice.status !== 'paid' || !invoice.paid_at) return false;
      const cutoff = new Date(stableReferenceDate);
      cutoff.setDate(cutoff.getDate() - 30);
      return new Date(invoice.paid_at).getTime() >= cutoff.getTime();
    });
    return {
      overdueAmount: overdue.reduce((total, invoice) => total + invoice.total_cents, 0),
      overdueCount: overdue.length,
      notDueAmount: open.filter((invoice) => !invoice.is_overdue).reduce((total, invoice) => total + invoice.total_cents, 0),
      notDueCount: open.filter((invoice) => !invoice.is_overdue).length,
      openAmount: open.reduce((total, invoice) => total + invoice.total_cents, 0),
      openCount: open.length,
      paidAmount: paid.reduce((total, invoice) => total + invoice.total_cents, 0),
      paidCount: paid.length,
      notDepositedAmount: paid.filter((invoice) => !invoice.stripe_payment_intent_id).reduce((total, invoice) => total + invoice.total_cents, 0),
      notDepositedCount: paid.filter((invoice) => !invoice.stripe_payment_intent_id).length,
      depositedAmount: paid.filter((invoice) => Boolean(invoice.stripe_payment_intent_id)).reduce((total, invoice) => total + invoice.total_cents, 0),
      depositedCount: paid.filter((invoice) => Boolean(invoice.stripe_payment_intent_id)).length,
    };
  }, [invoices, stableReferenceDate]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return invoices
      .filter((invoice) => {
        if (type !== 'all' && transactionType(invoice) !== type) return false;
        if (!inDateRange(invoice, dateFilter, stableReferenceDate)) return false;
        if (status === 'draft' && invoice.status !== 'draft') return false;
        if (status === 'open' && !['sent', 'overdue'].includes(invoice.status)) return false;
        if (status === 'overdue' && !invoice.is_overdue) return false;
        if (status === 'paid' && invoice.status !== 'paid') return false;
        if (status === 'void' && invoice.status !== 'void') return false;
        if (delivery === 'email' && !invoice.stripe_payment_link_url) return false;
        if (delivery === 'not-sent' && invoice.stripe_payment_link_url) return false;
        if (errors === 'missing-email' && invoice.bill_to_email) return false;
        if (errors === 'past-due' && !invoice.is_overdue) return false;
        if (!normalized) return true;
        return [
          invoice.number,
          invoice.advertiser_name,
          invoice.bill_to_name,
          invoice.bill_to_email,
          invoice.memo,
          memoSummary(invoice),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(normalized);
      })
      .sort((a, b) => {
        const av = sortValue(a, sortKey, referenceTime);
        const bv = sortValue(b, sortKey, referenceTime);
        const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [dateFilter, delivery, errors, invoices, query, referenceTime, stableReferenceDate, status, type, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalAmount = filteredRows.reduce((total, invoice) => total + invoice.total_cents, 0);
  const allPageSelected = pageRows.length > 0 && pageRows.every((invoice) => selected.has(invoice.id));

  const updateFilter = (callback: () => void) => {
    callback();
    setPage(1);
  };

  const togglePage = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allPageSelected) pageRows.forEach((invoice) => next.delete(invoice.id));
      else pageRows.forEach((invoice) => next.add(invoice.id));
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((currentDir) => (currentDir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  };

  const patchInvoice = async (invoice: InvoiceWithAdvertiser, payload: Record<string, unknown>) => {
    const response = await fetch(`/api/admin/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? 'Transaction update failed.');
  };

  const duplicateInvoice = async (invoice: InvoiceWithAdvertiser, openEditor = false) => {
    setBusy(true);
    fail('');
    try {
      const response = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advertiser_id: invoice.advertiser_id,
          agreement_id: invoice.agreement_id,
          status: 'draft',
          amount_cents: invoice.amount_cents,
          tax_cents: invoice.tax_cents,
          due_date: invoice.due_date,
          bill_to_name: invoice.bill_to_name,
          bill_to_email: invoice.bill_to_email,
          bill_to_address: invoice.bill_to_address,
          memo: invoice.memo,
          line_items: invoice.line_items,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not duplicate transaction.');
      await reload();
      setMessage(`${invoice.number ?? 'Transaction'} duplicated as a draft.`);
      if (openEditor && data.invoice?.id) {
        const fresh = await fetch(`/api/admin/invoices/${data.invoice.id}`).then((result) => result.json());
        if (fresh.invoice) setEditingInvoice(fresh.invoice);
      }
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Could not duplicate transaction.');
    } finally {
      setBusy(false);
    }
  };

  const sendInvoice = async (
    invoice: InvoiceWithAdvertiser,
    reminder = false,
    email?: { from: InvoiceSender; to: string; subject: string; message: string },
  ) => {
    setBusy(true);
    fail('');
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          send_email: true,
          email_mode: reminder ? 'reminder' : 'invoice',
          email_from: email?.from,
          email_to: email?.to,
          email_subject: email?.subject,
          email_message: email?.message,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not send invoice.');
      if (data.email_status !== 'sent') {
        const reason =
          typeof data.email_error === 'string' && data.email_error.trim()
            ? data.email_error.trim()
            : data.email_status === 'no_email'
            ? 'This customer does not have an email address.'
            : data.email_status === 'failed'
              ? 'The email provider could not deliver this message.'
              : 'Email delivery is not configured.';
        throw new Error(reason);
      }
      if (invoice.status === 'draft') await patchInvoice(invoice, { status: 'sent' });
      await reload();
      setMessage(reminder ? `Reminder sent for ${invoice.number}.` : `${invoice.number} sent.`);
      setEmailDraft(null);
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Could not send invoice.');
    } finally {
      setBusy(false);
    }
  };

  const createTask = async (invoice: InvoiceWithAdvertiser) => {
    const note = window.prompt(`Task for ${invoice.number ?? 'transaction'}:`);
    if (!note?.trim()) return;
    setBusy(true);
    fail('');
    try {
      const stamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());
      await patchInvoice(invoice, {
        memo: [invoice.memo, `Task (${stamp}): ${note.trim()}`].filter(Boolean).join('\n'),
      });
      await reload();
      setMessage(`Task added to ${invoice.number}.`);
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Could not create task.');
    } finally {
      setBusy(false);
    }
  };

  const voidInvoice = async (invoice: InvoiceWithAdvertiser) => {
    if (!window.confirm(`Void ${invoice.number ?? 'this transaction'}? This keeps the record but removes it from open receivables.`)) return;
    setBusy(true);
    fail('');
    try {
      await patchInvoice(invoice, { status: 'void' });
      await reload();
      setMessage(`${invoice.number} voided.`);
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Could not void transaction.');
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async (invoice: InvoiceWithAdvertiser) => {
    const confirmation = window.prompt(`Permanent deletion cannot be undone. Type this invoice ID to delete it:\n${invoice.id}`);
    if (confirmation !== invoice.id) {
      fail('Transaction was not deleted: the typed ID did not match.');
      return;
    }
    setBusy(true);
    fail('');
    try {
      const response = await fetch(`/api/admin/invoices/${invoice.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: true, confirmation_id: confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not delete draft.');
      await reload();
      setSelected((current) => {
        const next = new Set(current);
        next.delete(invoice.id);
        return next;
      });
      setMessage('Transaction permanently deleted.');
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Could not delete draft.');
    } finally {
      setBusy(false);
    }
  };

  const printInvoice = (invoice: InvoiceWithAdvertiser, packingSlip = false) => {
    const suffix = packingSlip ? '?packing=1' : '';
    window.open(`/admin/invoices/${invoice.id}/preview${suffix}`, '_blank', 'noopener,noreferrer');
  };

  const runBatch = async (action: BatchAction | '') => {
    if (!action) return;
    const targets = invoices.filter((invoice) => selected.has(invoice.id));
    if (targets.length === 0) {
      fail('Select at least one transaction first.');
      return;
    }
    if (action === 'print') {
      targets.forEach((invoice) => printInvoice(invoice));
      return;
    }
    if (!window.confirm(`${action === 'delete' ? 'Delete selected drafts' : action === 'void' ? 'Void' : action === 'remind' ? 'Send reminders for' : 'Send'} ${targets.length} selected transaction${targets.length === 1 ? '' : 's'}?`)) return;
    setBusy(true);
    fail('');
    try {
      for (const invoice of targets) {
        if (action === 'delete') {
          if (invoice.status !== 'draft') continue;
          const response = await fetch(`/api/admin/invoices/${invoice.id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error(`Could not delete ${invoice.number}.`);
        } else if (action === 'void') {
          if (!['paid', 'void'].includes(invoice.status)) await patchInvoice(invoice, { status: 'void' });
        } else {
          const response = await fetch(`/api/admin/invoices/${invoice.id}/payment-link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ send_email: true }),
          });
          if (!response.ok) throw new Error(`Could not send ${invoice.number}.`);
          if (invoice.status === 'draft') await patchInvoice(invoice, { status: 'sent' });
        }
      }
      await reload();
      setSelected(new Set());
      setMessage('Batch action completed.');
    } catch (value) {
      fail(value instanceof Error ? value.message : 'Batch action failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRowAction = (invoice: InvoiceWithAdvertiser, action: string) => {
    setRowMenuId(null);
    if (action === 'edit') setEditingInvoice(invoice);
    if (action === 'duplicate') void duplicateInvoice(invoice);
    if (action === 'duplicate-ai') void duplicateInvoice(invoice, true);
    if (action === 'send') setEmailDraft({ invoice, reminder: false });
    if (action === 'remind') setEmailDraft({ invoice, reminder: true });
    if (action === 'task') void createTask(invoice);
    if (action === 'share') setShareInvoice(invoice);
    if (action === 'recurring') setRecurringInvoice(invoice);
    if (action === 'print') printInvoice(invoice);
    if (action === 'packing') printInvoice(invoice, true);
    if (action === 'void') void voidInvoice(invoice);
    if (action === 'delete') void deleteDraft(invoice);
    if (action === 'activity') setActivityInvoice(invoice);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
            Admin · Get Paid
          </div>
          <PageTitle size="md">{invoiceWorkspace ? 'Invoices' : 'Sales transactions'}</PageTitle>
        </div>
        <button type="button" className="text-sm font-medium text-orange-700 hover:underline">
          Give feedback
        </button>
      </div>

      {invoiceWorkspace ? (
        <section aria-label="Invoice summary" className="grid gap-8 bg-white md:grid-cols-2">
          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">{formatCents(summary.openAmount)} Unpaid <span className="ml-2 text-xs font-normal text-gray-500">Last 365 days</span></div>
            <div className="grid grid-cols-2">
              <SummaryMetric amount={summary.overdueAmount} count={summary.overdueCount} label="overdue" />
              <div className="border-l border-gray-200 text-right"><SummaryMetric amount={summary.notDueAmount} count={summary.notDueCount} label="not due yet" /></div>
            </div>
            <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
              <div className="bg-orange-600" style={{ width: `${summary.openAmount ? (summary.overdueAmount / summary.openAmount) * 100 : 0}%` }} />
              <div className="flex-1 bg-orange-300" />
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold text-gray-800">{formatCents(summary.paidAmount)} Paid <span className="ml-2 text-xs font-normal text-gray-500">Last 30 days</span></div>
            <div className="grid grid-cols-2">
              <SummaryMetric amount={summary.notDepositedAmount} count={summary.notDepositedCount} label="not deposited" />
              <div className="border-l border-gray-200 text-right"><SummaryMetric amount={summary.depositedAmount} count={summary.depositedCount} label="deposited" /></div>
            </div>
            <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
              <div className="bg-emerald-400" style={{ width: `${summary.paidAmount ? (summary.notDepositedAmount / summary.paidAmount) * 100 : 0}%` }} />
              <div className="flex-1 bg-emerald-600" />
            </div>
          </div>
        </section>
      ) : (
        <section aria-label="Sales transaction summary" className="bg-white">
          <div className="grid grid-cols-2 gap-y-3 md:grid-cols-4">
            <SummaryMetric amount={0} count={0} label="estimates" />
            <SummaryMetric amount={summary.overdueAmount} count={summary.overdueCount} label="overdue invoices" />
            <SummaryMetric amount={summary.openAmount} count={summary.openCount} label="open invoices and credits" />
            <SummaryMetric amount={summary.paidAmount} count={summary.paidCount} label="recently paid" />
          </div>
          <div className="mt-2 flex h-4 overflow-hidden rounded-sm bg-gray-200" aria-hidden="true">
            <div className="w-[12%] bg-cyan-300" />
            <div className="w-[28%] bg-orange-600" />
            <div className="w-[43%] bg-gray-300" />
            <div className="w-[16.5%] bg-orange-500" />
            <div className="w-[0.5%] min-w-1 bg-emerald-600" />
          </div>
        </section>
      )}

      {(message || error) && (
        <div
          role="status"
          className={`rounded border px-4 py-2 text-sm ${
            error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || message}
        </div>
      )}

      <section aria-label={invoiceWorkspace ? 'Invoice filters' : 'Transaction filters'} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          {!invoiceWorkspace && <label className="space-y-1">
            <span className="block text-xs text-transparent" aria-hidden="true">Actions</span>
            <select
              aria-label="Batch actions"
              className={`${CONTROL} min-w-32`}
              defaultValue=""
              disabled={busy}
              onChange={(event) => {
                void runBatch(event.target.value as BatchAction);
                event.target.value = '';
              }}
            >
              <option value="">Batch actions</option>
              <option value="send">Send</option>
              <option value="remind">Send reminder</option>
              <option value="print">Print</option>
              <option value="void">Void</option>
              <option value="delete">Delete drafts</option>
            </select>
          </label>}
          <label className="space-y-1">
            <span className="block text-xs text-gray-500">Type</span>
            <select className={`${CONTROL} min-w-36`} value={type} onChange={(event) => updateFilter(() => setType(event.target.value as TypeFilter))}>
              <option value="all">All transactions</option>
              <option value="invoice">Invoices</option>
              <option value="receipt">Sales receipts</option>
              <option value="payment">Payments</option>
            </select>
          </label>
          {invoiceWorkspace && (
            <label className="space-y-1">
              <span className="block text-xs text-gray-500">Status</span>
              <select className={`${CONTROL} min-w-36`} value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value as StatusFilter))}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="open">Open</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
                <option value="void">Void</option>
              </select>
            </label>
          )}
          <label className="space-y-1">
            <span className="block text-xs text-gray-500">Date</span>
            <select className={`${CONTROL} min-w-36`} value={dateFilter} onChange={(event) => updateFilter(() => setDateFilter(event.target.value as DateFilter))}>
              <option value="30-days">Last 30 days</option>
              <option value="3-months">Last 3 months</option>
              <option value="12-months">Last 12 months</option>
              <option value="all">All dates</option>
            </select>
          </label>
          {!invoiceWorkspace && <label className="min-w-60 flex-1 space-y-1">
            <span className="block text-xs text-gray-500">Client</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                className={`${CONTROL} w-full pl-9`}
                placeholder="Search"
                value={query}
                onChange={(event) => updateFilter(() => setQuery(event.target.value))}
              />
            </span>
          </label>}
          <div className="relative ml-auto flex">
            <button type="button" className={`${ORANGE_BUTTON} rounded-r-none`} onClick={() => setCreatingInvoice(true)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Create invoice
            </button>
            <button
              type="button"
              aria-label="More create actions"
              className={`${ORANGE_BUTTON} -ml-px rounded-l-none px-2`}
              onClick={() => setCreateMenuOpen((open) => !open)}
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            {createMenuOpen && (
              <div className="absolute right-0 top-10 z-40 w-52 rounded border border-gray-200 bg-white py-1 shadow-lg">
                <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setCreatingInvoice(true); setCreateMenuOpen(false); }}>Create invoice</button>
                {!invoiceWorkspace && <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setCreatingReceipt(true); setCreateMenuOpen(false); }}>Create sales receipt</button>}
                <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { const first = invoices.find((invoice) => !['paid', 'void'].includes(invoice.status)); if (first) setPaymentLinkInvoice(first); else fail('No unpaid invoice is available.'); setCreateMenuOpen(false); }}>Create payment link</button>
                <button type="button" className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { const first = invoices[0]; if (first) setRecurringInvoice(first); else fail('Create a customer invoice first.'); setCreateMenuOpen(false); }}>Create recurring payment</button>
              </div>
            )}
          </div>
        </div>
        {!invoiceWorkspace && <div className="flex flex-wrap items-center gap-1 text-xs">
          <select aria-label="Status filter" className="rounded border-0 bg-transparent px-1 py-1.5 text-gray-600 outline-none hover:text-gray-900" value={status} onChange={(event) => updateFilter(() => setStatus(event.target.value as StatusFilter))}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <span className="text-gray-300">·</span>
          <select aria-label="Delivery method filter" className="rounded border-0 bg-transparent px-1 py-1.5 text-gray-600 outline-none hover:text-gray-900" value={delivery} onChange={(event) => updateFilter(() => setDelivery(event.target.value as DeliveryFilter))}>
            <option value="all">Delivery method</option>
            <option value="email">Payment link created</option>
            <option value="not-sent">Not sent</option>
          </select>
          <span className="text-gray-300">·</span>
          <select aria-label="Errors filter" className="rounded border-0 bg-transparent px-1 py-1.5 text-gray-600 outline-none hover:text-gray-900" value={errors} onChange={(event) => updateFilter(() => setErrors(event.target.value as ErrorFilter))}>
            <option value="all">Errors</option>
            <option value="missing-email">Missing email</option>
            <option value="past-due">Past due</option>
          </select>
        </div>}
      </section>

      <section className="relative rounded border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className={`${invoiceWorkspace ? 'min-w-[1140px]' : 'min-w-[1320px]'} w-full table-fixed text-left text-xs`}>
            <thead className="border-b border-gray-300 bg-white text-gray-700">
              <tr>
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" aria-label="Select all visible transactions" checked={allPageSelected} onChange={togglePage} />
                </th>
                <SortableTh label="Date" sortKey="date" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                <SortableTh label="Billing date" sortKey="billing_date" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                <SortableTh label="Payment received" sortKey="payment_received" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-24" />
                {!invoiceWorkspace && <SortableTh label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-28" />}
                <SortableTh label="No." sortKey="number" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-32" />
                <SortableTh label="Client" sortKey="client" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-52" />
                {!invoiceWorkspace && <th className="px-2 py-3 font-semibold">Memo</th>}
                <SortableTh label="Amount" sortKey="amount" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-28" align="right" />
                <SortableTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} className="w-36" />
                <th className="w-64 px-2 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageRows.map((invoice) => {
                const memo = memoSummary(invoice);
                const canReceivePayment = !['paid', 'void'].includes(invoice.status);
                return (
                  <tr key={invoice.id} className="group hover:bg-orange-50/40">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${invoice.number ?? 'transaction'}`}
                        checked={selected.has(invoice.id)}
                        onChange={() => setSelected((current) => {
                          const next = new Set(current);
                          if (next.has(invoice.id)) next.delete(invoice.id);
                          else next.add(invoice.id);
                          return next;
                        })}
                      />
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">{formatTransactionDate(transactionDate(invoice))}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">{formatTransactionDate(invoice.issued_at)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-gray-700">{formatTransactionDate(paymentReceivedDate(invoice))}</td>
                    {!invoiceWorkspace && <td className="px-2 py-2.5 text-gray-700">{transactionTypeLabel(invoice)}</td>}
                    <td className="truncate px-2 py-2.5 font-medium text-gray-800" title={invoice.number ?? 'Draft'}>{invoice.number ?? 'Draft'}</td>
                    <td className="truncate px-2 py-2.5 text-gray-800" title={invoice.advertiser_name ?? invoice.bill_to_name ?? ''}>{invoice.advertiser_name ?? invoice.bill_to_name ?? '—'}</td>
                    {!invoiceWorkspace && <td className="truncate px-2 py-2.5 text-gray-600" title={memo}>{memo}</td>}
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-medium text-gray-800">{formatCents(invoice.total_cents)}</td>
                    <td className="px-2 py-2.5"><StatusCell invoice={invoice} referenceTime={referenceTime} /></td>
                    <td className="relative whitespace-nowrap px-2 py-2.5 text-right">
                      <button type="button" disabled={busy} className="font-medium text-orange-700 hover:underline disabled:opacity-50" onClick={() => setEditingInvoice(invoice)}>View/Edit</button>
                      {canReceivePayment ? (
                        <button type="button" disabled={busy} className="ml-3 font-medium text-orange-700 hover:underline disabled:opacity-50" onClick={() => setPaymentInvoice(invoice)}>Receive payment</button>
                      ) : (
                        <button type="button" className="ml-3 font-medium text-orange-700 hover:underline" onClick={() => printInvoice(invoice)}>
                          <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" aria-hidden="true" />Print</span>
                        </button>
                      )}
                      <button type="button" aria-label={`More actions for ${invoice.number ?? 'transaction'}`} disabled={busy} className="ml-2 inline-flex rounded p-1 text-orange-700 hover:bg-orange-100 disabled:opacity-50" onClick={() => setRowMenuId((id) => id === invoice.id ? null : invoice.id)}>
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      {rowMenuId === invoice.id && (
                        <div className="absolute right-2 top-9 z-50 w-56 rounded border border-gray-200 bg-white py-1 text-left text-sm text-gray-800 shadow-xl">
                          {[
                            ['edit', 'View/Edit'],
                            ['duplicate', 'Duplicate'],
                            ['duplicate-ai', 'Duplicate with AI'],
                            ['send', 'Send'],
                            ['remind', 'Send reminder'],
                            ['task', 'Create task'],
                            ['share', 'Share invoice link'],
                            ['recurring', 'Make recurring payment'],
                            ['print', 'Print'],
                            ['packing', 'Print packing slip'],
                            ['void', 'Void'],
                            ['delete', 'Delete'],
                            ['activity', 'View activity'],
                          ].map(([action, label]) => (
                            <button
                              type="button"
                              key={action}
                              className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-gray-50 ${
                                (action === 'delete' && invoice.status !== 'draft') ||
                                (['send', 'remind', 'share', 'void'].includes(action) && ['paid', 'void'].includes(invoice.status))
                                  ? 'cursor-not-allowed text-gray-400'
                                  : ''
                              }`}
                              disabled={
                                (action === 'delete' && invoice.status !== 'draft') ||
                                (['send', 'remind', 'share', 'void'].includes(action) && ['paid', 'void'].includes(invoice.status))
                              }
                              onClick={() => handleRowAction(invoice, action)}
                            >
                              <span>{label}</span>
                              {action === 'duplicate-ai' && <span className="rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-700">NEW</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pageRows.length === 0 && <div className="p-12 text-center text-sm text-gray-500">No {invoiceWorkspace ? 'invoices' : 'sales transactions'} match these filters.</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-300 bg-gray-50 px-4 py-3 text-xs text-gray-700">
          <div className="pl-8 font-semibold">Total <span className="ml-10">{formatCents(totalAmount)}</span></div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1">
              Rows
              <select className="rounded border border-gray-300 bg-white px-1 py-1" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <span>{filteredRows.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length}` : '0 results'}</span>
            <button type="button" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(1)}>First</button>
            <button type="button" aria-label="Previous page" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Next page" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={currentPage === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight className="h-4 w-4" /></button>
            <button type="button" className="rounded p-1 hover:bg-gray-200 disabled:opacity-40" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Last</button>
          </div>
        </div>
      </section>

      {creatingInvoice && <InvoiceDrawer advertisers={advertisers} agreements={agreements} seed={invoiceSeed ?? undefined} onClose={() => setCreatingInvoice(false)} onSaved={saved} onError={fail} />}
      {editingInvoice && <InvoiceDrawer existing={editingInvoice} advertisers={advertisers} agreements={agreements} onClose={() => setEditingInvoice(null)} onSaved={saved} onError={fail} />}
      {paymentLinkInvoice && <PaymentLinkDrawer invoices={invoices} advertisers={advertisers} initialInvoiceId={paymentLinkInvoice.id} onClose={() => setPaymentLinkInvoice(null)} onSaved={reload} onError={fail} />}
      {shareInvoice && <ShareInvoiceDialog invoice={shareInvoice} onClose={() => setShareInvoice(null)} onCreated={reload} onError={fail} />}
      {emailDraft && (
        <EmailInvoiceDialog
          draft={emailDraft}
          busy={busy}
          referenceTime={referenceTime}
          onClose={() => setEmailDraft(null)}
          onSend={(values) => void sendInvoice(emailDraft.invoice, emailDraft.reminder, values)}
        />
      )}
      {paymentInvoice && <RecordPaymentDrawer invoices={invoices} advertisers={advertisers} initialInvoiceId={paymentInvoice.id} onClose={() => setPaymentInvoice(null)} onSaved={reload} onError={fail} />}
      {creatingReceipt && <SalesReceiptDrawer invoices={invoices} advertisers={advertisers} onClose={() => setCreatingReceipt(false)} onSaved={reload} onError={fail} />}
      {recurringInvoice && (
        <RecurringScheduleDrawer
          advertisers={advertisers}
          agreements={agreements}
          seed={{ advertiser_id: recurringInvoice.advertiser_id, agreement_id: recurringInvoice.agreement_id }}
          onClose={() => setRecurringInvoice(null)}
          onSaved={async () => { setRecurringInvoice(null); setMessage('Recurring payment created.'); }}
          onError={fail}
        />
      )}

      {activityInvoice && (
        <div className="fixed inset-0 z-[70] bg-gray-950/30" role="dialog" aria-modal="true" aria-label="Invoice activity" onMouseDown={(event) => { if (event.currentTarget === event.target) setActivityInvoice(null); }}>
          <aside className="ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div className="text-sm font-semibold text-gray-900">Invoice {activityInvoice.number ?? 'Draft'}</div>
              <button type="button" aria-label="Close activity" className="rounded p-1 text-gray-500 hover:bg-gray-100" onClick={() => setActivityInvoice(null)}>×</button>
            </header>
            <div className="flex-1 overflow-y-auto">
              <section className="border-b border-gray-200 px-5 py-4">
                <div className={`inline-flex items-center gap-1.5 text-xs font-medium ${activityInvoice.is_overdue ? 'text-orange-700' : activityInvoice.status === 'paid' ? 'text-emerald-700' : 'text-gray-600'}`}>
                  <span className={`h-2 w-2 rounded-full ${activityInvoice.is_overdue ? 'bg-orange-600' : activityInvoice.status === 'paid' ? 'bg-emerald-600' : 'bg-gray-400'}`} />
                  {statusLabel(activityInvoice, referenceTime)}
                </div>
                <div className="mt-2 text-xs font-medium text-gray-600">Total due</div>
                <div className="text-3xl font-semibold tracking-tight text-gray-900">{formatCents(activityInvoice.balance_cents ?? (activityInvoice.status === 'paid' ? 0 : activityInvoice.total_cents))}</div>
                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div><div className="text-gray-500">Invoice date</div><div className="mt-1 font-medium text-gray-900">{formatTransactionDate(activityInvoice.issued_at ?? activityInvoice.created_at)}</div></div>
                  <div><div className="text-gray-500">Due date</div><div className="mt-1 font-medium text-gray-900">{formatTransactionDate(activityInvoice.due_date)}</div></div>
                </div>
              </section>

              <section className="border-b border-gray-200 px-5 py-4 text-sm">
                <div className="font-semibold text-gray-900">{activityInvoice.advertiser_name ?? activityInvoice.bill_to_name ?? 'Customer'}</div>
                {activityInvoice.bill_to_address && <div className="mt-3 whitespace-pre-line text-xs leading-5 text-gray-600">{activityInvoice.bill_to_address}</div>}
                {activityInvoice.bill_to_email && <a href={`mailto:${activityInvoice.bill_to_email}`} className="mt-3 block break-all text-xs font-medium text-orange-700 hover:underline">{activityInvoice.bill_to_email}</a>}
              </section>

              {!!activityInvoice.payments?.length && (
                <section className="border-b border-gray-200 px-5 py-4">
                  <h3 className="text-sm font-semibold text-gray-900">Payments</h3>
                  <div className="mt-3 space-y-3">
                    {activityInvoice.payments.map((payment) => (
                      <div key={payment.id} className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-900">{formatCents(payment.amount_cents)}</span>
                          <span className="text-gray-600">{formatTransactionDate(payment.payment_date)}</span>
                        </div>
                        <div className="mt-1 text-gray-600">
                          {[payment.payment_method, payment.reference && `Ref ${payment.reference}`].filter(Boolean).join(' · ') || 'Payment'}
                        </div>
                        {payment.memo && <div className="mt-1 whitespace-pre-line text-gray-500">{payment.memo}</div>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="border-b border-gray-200 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Invoice activity</h3>
                <ol className="mt-4 space-y-0">
                  {[
                    { label: 'Opened', date: activityInvoice.created_at, complete: true },
                    { label: 'Sent', date: activityInvoice.issued_at, complete: Boolean(activityInvoice.issued_at) },
                    { label: 'Viewed', date: null, complete: false },
                    { label: 'Paid', date: activityInvoice.paid_at, complete: Boolean(activityInvoice.paid_at) },
                    { label: 'Payout sent', date: null, complete: false },
                  ].map((step, index, steps) => (
                    <li key={step.label} className="relative flex min-h-14 gap-3 text-xs">
                      {index < steps.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-gray-200" />}
                      <span className={`relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${step.complete ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300 bg-white'}`} />
                      <div>
                        <div className={step.complete ? 'font-medium text-gray-900' : 'text-gray-500'}>{step.label}</div>
                        {step.date && <div className="mt-0.5 text-gray-500">{new Date(step.date).toLocaleString()}</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="border-b border-gray-200 px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Products and services</h3>
                <div className="mt-3 space-y-3">
                  {(activityInvoice.line_items?.length ? activityInvoice.line_items : [{ description: activityInvoice.memo ?? 'Invoice', qty: 1, unit_cents: activityInvoice.amount_cents }]).map((item, index) => (
                    <div key={`${item.description}-${index}`} className="text-xs">
                      <div className="font-medium text-gray-900">{item.description}</div>
                      <div className="mt-0.5 text-gray-500">{item.qty} × {formatCents(item.unit_cents)} · {formatCents(item.qty * item.unit_cents)}</div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="px-5 py-4">
                <h3 className="text-sm font-semibold text-gray-900">Attachments</h3>
                <p className="mt-2 text-xs text-gray-500">No attachments on this invoice.</p>
              </section>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3">
              <button type="button" className="rounded border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50" onClick={() => { setActivityInvoice(null); setRowMenuId(activityInvoice.id); }}>More actions</button>
              <button type="button" className={ORANGE_BUTTON} onClick={() => { const invoice = activityInvoice; setActivityInvoice(null); setEditingInvoice(invoice); }}>Edit invoice</button>
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}
