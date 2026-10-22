'use client';

// Billing > Invoices, "All clients" scope: the complete invoice workspace (formerly Get Paid > Invoices).
// Same invoice records and the same editor, payment and link components, so nothing is duplicated or lost.
// Beta rule: nothing here emails a client. Issuing an invoice only changes its status; links are copied.

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { A, EmptyState, RowMenu, SearchBox, type MenuItem } from '@/components/anchor/ui';
import SortTable from '@/components/anchor/SortTable';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, outstandingCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/beta-core/billing/types';
import { InvoiceDrawer } from '@/app/admin/beta-core/billing/InvoiceDrawer';
import { PaymentLinkDrawer, RecordPaymentDrawer, SalesReceiptDrawer } from '@/app/admin/beta-core/PaymentActionDrawers';
import { ScheduledInvoicesPanel } from '@/app/admin/beta-core/ScheduledInvoicesPanel';
import { isNative } from '@/lib/native/runtime';
import { BETA_EMAIL_ENABLED } from '@/lib/beta-email';
import EmailInvoiceDialog, { type EmailValues } from './EmailInvoiceDialog';

export type InvoiceIntent = {
  edit?: string;
  create?: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null };
};

type Inv = InvoiceWithAdvertiser;
type DateFilter = 'all' | 'today' | '30-days' | '3-months' | '12-months';
type StatusFilter = 'all' | 'scheduled' | 'draft' | 'open' | 'overdue' | 'paid' | 'void';
type ErrorFilter = 'all' | 'missing-email' | 'past-due';
type TypeFilter = 'all' | 'invoice' | 'receipt';
type Batch = 'issue' | 'send' | 'remind' | 'print' | 'void' | 'delete';

const PAGE_SIZES = [25, 50, 100];
const SELECT = 'anchor-input rounded-[10px] border border-[color:var(--ds-line)] bg-white px-3 py-2 text-sm text-[color:var(--ds-ink)]';

const iso = (v: string | Date | null | undefined) => (v ? (typeof v === 'string' ? v : v.toISOString()).slice(0, 10) : '');
const day = (v: string | Date | null | undefined) => {
  const s = iso(v);
  if (!s) return '—';
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const txDate = (i: Inv) => i.issued_at ?? i.created_at;
// The real receipt date comes from the payment rows; paid_at is only a fallback.
const receivedDate = (i: Inv) => {
  const latest = (i.payments ?? []).reduce<string | null>((m, p) => (p.payment_date && (!m || p.payment_date > m) ? p.payment_date : m), null);
  return latest ?? i.paid_at;
};
// Whole calendar days past the due date, so it matches the dashboard aging.
const daysOver = (i: Inv, now: number) => {
  if (!i.due_date) return 0;
  const t = new Date(now); t.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((t.getTime() - new Date(`${iso(i.due_date)}T00:00:00`).getTime()) / 86_400_000));
};
const statusText = (i: Inv, now: number) =>
  i.is_overdue ? `Overdue ${daysOver(i, now)} days` : i.status === 'paid' ? 'Paid' : i.status === 'sent' ? 'Open' : i.status[0].toUpperCase() + i.status.slice(1);
const isReceipt = (i: Inv) => Boolean(i.number?.startsWith('SR-'));
const memoOf = (i: Inv) => i.line_items?.map((l) => l.description?.trim()).filter(Boolean).join('; ') || i.memo || '';
const safeUrl = (v: unknown): v is string => { try { return typeof v === 'string' && /^https?:$/.test(new URL(v).protocol); } catch { return false; } };

function inRange(i: Inv, f: DateFilter, ref: Date) {
  if (f === 'all') return true;
  const t = new Date(txDate(i)).getTime();
  if (f === 'today') { const s = new Date(ref); s.setHours(0, 0, 0, 0); return t >= s.getTime() && t < s.getTime() + 86_400_000; }
  const c = new Date(ref);
  if (f === '30-days') c.setDate(c.getDate() - 30); else c.setMonth(c.getMonth() - (f === '3-months' ? 3 : 12));
  return t >= c.getTime();
}

function StatusChip({ i, now }: { i: Inv; now: number }) {
  const tone = i.status === 'paid' ? 'border-green-600 text-green-700' : i.is_overdue ? 'border-red-500 text-red-700' : i.status === 'void' ? 'border-[color:var(--ds-placeholder)] text-[color:var(--ds-body)]' : 'border-[color:var(--ds-body)] text-[color:var(--ds-ink)]';
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${tone}`}>{statusText(i, now)}</span>;
}

function Metric({ amount, count, label }: { amount: number; count: number; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-lg font-semibold text-[color:var(--ds-ink)]">{formatCents(amount)}</div>
      <div className="truncate text-xs text-[color:var(--ds-body)]">{count.toLocaleString()} {label}</div>
    </div>
  );
}

function ShareLinkDialog({ invoice, onClose, onCreated, onError }: { invoice: Inv; onClose: () => void; onCreated: () => Promise<void>; onError: (m: string) => void }) {
  const existing = safeUrl(invoice.stripe_payment_link_url) ? invoice.stripe_payment_link_url : '';
  const [url, setUrl] = useState(existing);
  const [loading, setLoading] = useState(!existing);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (url) return;
    let alive = true;
    fetch(`/api/admin/invoices/${invoice.id}/payment-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send_email: false }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? 'Could not create invoice link.');
        const u = j.checkout_url ?? j.portal_pay_url;
        if (!safeUrl(u)) throw new Error('The payment service returned an unsafe link.');
        if (alive) { setUrl(u); await onCreated(); }
      })
      .catch((e) => { if (alive) onError(e instanceof Error ? e.message : 'Could not create invoice link.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoice.id, onCreated, onError, url]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Share invoice link">
      <div className="w-full max-w-md rounded-[10px] bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Invoice link for {invoice.number ?? 'draft'}</h2>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">Copy this link and share it yourself. Your client can view and pay the invoice online. Nothing is emailed from beta.</p>
        <div className="mt-4 min-h-10 break-all rounded-[10px] border border-[color:var(--ds-line)] bg-[color:var(--ds-page)] px-3 py-2 text-sm text-[color:var(--ds-ink)]">{loading ? 'Creating secure link…' : url || 'Link could not be created.'}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={A.outline} disabled={!url} onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); }}>{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" className={A.primary} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function ActivityPanel({ invoice, now, onClose, onEdit }: { invoice: Inv; now: number; onClose: () => void; onEdit: () => void }) {
  const steps = [
    { label: 'Opened', date: invoice.created_at, done: true },
    { label: 'Sent', date: invoice.issued_at, done: Boolean(invoice.issued_at) },
    { label: 'Viewed', date: null, done: false },
    { label: 'Paid', date: invoice.paid_at, done: Boolean(invoice.paid_at) },
    { label: 'Payout sent', date: null, done: false },
  ];
  const lines = invoice.line_items?.length ? invoice.line_items : [{ description: invoice.memo ?? 'Invoice', qty: 1, unit_cents: invoice.amount_cents }];
  return (
    <div className="fixed inset-0 z-[70] bg-black/30" role="dialog" aria-modal="true" aria-label="Invoice activity" onMouseDown={(e) => { if (e.currentTarget === e.target) onClose(); }}>
      <aside className="ml-auto flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-[color:var(--ds-line)] px-4 py-4">
          <div className="text-sm font-semibold text-[color:var(--ds-ink)]">Invoice {invoice.number ?? 'Draft'}</div>
          <button type="button" aria-label="Close activity" className="px-2 text-lg" style={{ background: 'transparent', border: 0 }} onClick={onClose}>×</button>
        </header>
        <div className="flex-1 overflow-y-auto text-sm">
          <section className="border-b border-[color:var(--ds-line)] px-4 py-4">
            <StatusChip i={invoice} now={now} />
            <div className="mt-3 text-xs text-[color:var(--ds-body)]">Total due</div>
            <div className="text-3xl font-semibold text-[color:var(--ds-ink)]">{formatCents(outstandingCents(invoice))}</div>
            <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
              <div><div className="text-[color:var(--ds-body)]">Invoice date</div><div className="mt-1 font-medium text-[color:var(--ds-ink)]">{day(invoice.issued_at ?? invoice.created_at)}</div></div>
              <div><div className="text-[color:var(--ds-body)]">Due date</div><div className="mt-1 font-medium text-[color:var(--ds-ink)]">{day(invoice.due_date)}</div></div>
            </div>
          </section>
          <section className="border-b border-[color:var(--ds-line)] px-4 py-4">
            <div className="font-semibold text-[color:var(--ds-ink)]">{invoice.advertiser_name ?? invoice.bill_to_name ?? 'Customer'}</div>
            {invoice.bill_to_address && <div className="mt-2 whitespace-pre-line text-xs text-[color:var(--ds-body)]">{invoice.bill_to_address}</div>}
            {invoice.bill_to_email && <div className="mt-2 break-all text-xs text-[color:var(--ds-primary)]">{invoice.bill_to_email}</div>}
          </section>
          {!!invoice.payments?.length && (
            <section className="border-b border-[color:var(--ds-line)] px-4 py-4">
              <h3 className="font-semibold text-[color:var(--ds-ink)]">Payments</h3>
              <div className="mt-3 space-y-2">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="rounded-[10px] border border-[color:var(--ds-line)] px-3 py-2 text-xs">
                    <div className="flex justify-between"><span className="font-medium text-[color:var(--ds-ink)]">{formatCents(p.amount_cents)}</span><span className="text-[color:var(--ds-body)]">{day(p.payment_date)}</span></div>
                    <div className="mt-1 text-[color:var(--ds-body)]">{[p.payment_method, p.reference && `Ref ${p.reference}`].filter(Boolean).join(' · ') || 'Payment'}</div>
                    {p.memo && <div className="mt-1 whitespace-pre-line text-[color:var(--ds-body)]">{p.memo}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="border-b border-[color:var(--ds-line)] px-4 py-4">
            <h3 className="font-semibold text-[color:var(--ds-ink)]">Invoice activity</h3>
            <ol className="mt-4">
              {steps.map((s, n) => (
                <li key={s.label} className="relative flex min-h-12 gap-3 text-xs">
                  {n < steps.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-[color:var(--ds-line)]" />}
                  <span className={`relative mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${s.done ? 'border-green-700 bg-green-700' : 'border-[color:var(--ds-line)] bg-white'}`} />
                  <div><div className={s.done ? 'font-medium text-[color:var(--ds-ink)]' : 'text-[color:var(--ds-body)]'}>{s.label}</div>{s.date && <div className="text-[color:var(--ds-body)]">{new Date(s.date).toLocaleString()}</div>}</div>
                </li>
              ))}
            </ol>
          </section>
          <section className="border-b border-[color:var(--ds-line)] px-4 py-4">
            <h3 className="font-semibold text-[color:var(--ds-ink)]">Products and services</h3>
            <div className="mt-3 space-y-3">
              {lines.map((l, n) => (
                <div key={n} className="text-xs">
                  <div className="font-medium text-[color:var(--ds-ink)]">{l.description}</div>
                  <div className="text-[color:var(--ds-body)]">{Number.isFinite(l.qty) && Number.isFinite(l.unit_cents) ? `${l.qty} × ${formatCents(l.unit_cents)} · ${formatCents(l.qty * l.unit_cents)}` : lines.length === 1 ? formatCents(invoice.total_cents) : 'Amount on invoice'}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="px-4 py-4"><h3 className="font-semibold text-[color:var(--ds-ink)]">Attachments</h3><p className="mt-2 text-xs text-[color:var(--ds-body)]">No attachments on this invoice.</p></section>
        </div>
        <footer className="flex justify-end gap-2 border-t border-[color:var(--ds-line)] px-4 py-3">
          <button type="button" className={A.outline} onClick={onClose}>Close</button>
          <button type="button" className={A.primary} onClick={onEdit}>Edit invoice</button>
        </footer>
      </aside>
    </div>
  );
}

export default function AllInvoices({ intent, initialQuery = '', onIntentDone }: { intent?: InvoiceIntent | null; initialQuery?: string; onIntentDone?: () => void }) {
  const [rows, setRows] = useState<Inv[] | null>(null);
  const [advertisers, setAdvertisers] = useState<AdvertiserOption[]>([]);
  const [agreements, setAgreements] = useState<AgreementWithAdvertiser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [dates, setDates] = useState<DateFilter>('all');
  const [errors, setErrors] = useState<ErrorFilter>('all');
  const [kind, setKind] = useState<TypeFilter>('all');
  const [receipt, setReceipt] = useState(false);
  const [emailing, setEmailing] = useState<{ invoice: Inv; reminder: boolean } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [creating, setCreating] = useState<InvoiceIntent['create'] | null>(null);
  const [editing, setEditing] = useState<Inv | null>(null);
  const [paying, setPaying] = useState<Inv | null>(null);
  const [linking, setLinking] = useState<Inv | null>(null);
  const [sharing, setSharing] = useState<Inv | null>(null);
  const [activity, setActivity] = useState<Inv | null>(null);
  const [createMenu, setCreateMenu] = useState(false);
  const [createSlot, setCreateSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setCreateSlot(document.getElementById('create-invoice-slot')); }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const consumed = useRef(false);

  const fail = useCallback((v: string) => { setErr(v); if (v) setMsg(''); }, []);
  const reload = useCallback(async () => {
    const r = await fetch('/api/admin/invoices', { cache: 'no-store', credentials: 'include' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'Could not refresh invoices.');
    setRows(j.invoices as Inv[]);
    setSel(new Set());
  }, []);

  useEffect(() => {
    const get = (u: string) => fetch(u, { credentials: 'include', cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); return j; });
    Promise.all([get('/api/admin/invoices'), get('/api/admin/advertisers'), get('/api/admin/agreements')])
      .then(([i, a, g]) => { setRows(i.invoices as Inv[]); setAdvertisers((a.advertisers ?? []) as AdvertiserOption[]); setAgreements((g.agreements ?? []) as AgreementWithAdvertiser[]); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load invoices.'));
  }, []);

  // Deep links from other screens (new invoice from a quote or agreement, open an invoice to edit).
  useEffect(() => {
    if (!rows || !intent || consumed.current) return;
    consumed.current = true;
    if (intent.create) setCreating(intent.create);
    if (intent.edit) { const hit = rows.find((i) => i.id === intent.edit); if (hit) setEditing(hit); else fail('That invoice could not be found.'); }
    onIntentDone?.();
  }, [rows, intent, onIntentDone, fail]);

  const ref = useMemo(() => new Date(now), [now]);
  const list = rows ?? [];

  const summary = useMemo(() => {
    const open = list.filter((i) => !['paid', 'void', 'draft'].includes(i.status));
    const over = open.filter((i) => i.is_overdue);
    const notDue = open.filter((i) => !i.is_overdue);
    const cutoff = now - 30 * 86_400_000;
    const paid = list.filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at).getTime() >= cutoff);
    const sum = (a: Inv[], f: (i: Inv) => number) => a.reduce((n, i) => n + f(i), 0);
    const stripe = paid.filter((i) => i.stripe_payment_intent_id);
    const other = paid.filter((i) => !i.stripe_payment_intent_id);
    return {
      openAmt: sum(open, outstandingCents), openN: open.length,
      overAmt: sum(over, outstandingCents), overN: over.length,
      notDueAmt: sum(notDue, outstandingCents), notDueN: notDue.length,
      paidAmt: sum(paid, (i) => i.total_cents),
      stripeAmt: sum(stripe, (i) => i.total_cents), stripeN: stripe.length,
      otherAmt: sum(other, (i) => i.total_cents), otherN: other.length,
    };
  }, [list, now]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return list.filter((i) => {
      if (kind === 'invoice' && isReceipt(i)) return false;
      if (kind === 'receipt' && !isReceipt(i)) return false;
      if (!inRange(i, dates, ref)) return false;
      if ((status === 'draft' || status === 'scheduled') && i.status !== 'draft') return false;
      if (status === 'open' && !['sent', 'overdue'].includes(i.status)) return false;
      if (status === 'overdue' && !i.is_overdue) return false;
      if (status === 'paid' && i.status !== 'paid') return false;
      if (status === 'void' && i.status !== 'void') return false;
      if (errors === 'missing-email' && i.bill_to_email) return false;
      if (errors === 'past-due' && !i.is_overdue) return false;
      return !term || [i.number, i.advertiser_name, i.bill_to_name, i.bill_to_email, i.memo, memoOf(i)].filter(Boolean).join(' ').toLowerCase().includes(term);
    });
  }, [list, q, status, dates, errors, kind, ref]);

  const pages = Math.max(1, Math.ceil(shown.length / size));
  const cur = Math.min(page, pages - 1);
  const totalDue = shown.reduce((n, i) => n + outstandingCents(i), 0);
  const reset = (f: () => void) => { f(); setPage(0); setSel(new Set()); };

  const patch = async (i: Inv, body: Record<string, unknown>) => {
    const r = await fetch(`/api/admin/invoices/${i.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'Invoice update failed.');
  };
  const run = async (fn: () => Promise<string | void>, fallback: string) => {
    setBusy(true); fail('');
    try { const m = await fn(); await reload(); if (m) setMsg(m); } catch (e) { fail(e instanceof Error ? e.message : fallback); } finally { setBusy(false); }
  };

  const duplicate = (i: Inv, open: boolean) => run(async () => {
    const r = await fetch('/api/admin/invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ advertiser_id: i.advertiser_id, agreement_id: i.agreement_id, status: 'draft', amount_cents: i.amount_cents, tax_cents: i.tax_cents, due_date: i.due_date, bill_to_name: i.bill_to_name, bill_to_email: i.bill_to_email, bill_to_address: i.bill_to_address, memo: i.memo, line_items: i.line_items }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? 'Could not duplicate invoice.');
    if (open && j.invoice?.id) { const f = await fetch(`/api/admin/invoices/${j.invoice.id}`).then((x) => x.json()); if (f.invoice) setEditing(f.invoice); }
    return `${i.number ?? 'Invoice'} duplicated as a draft.`;
  }, 'Could not duplicate invoice.');

  // Issuing marks a draft as sent. It never emails the client.
  const issue = (i: Inv) => run(async () => { await patch(i, { status: 'sent' }); return `${i.number ?? 'Invoice'} issued. No email was sent.`; }, 'Could not issue invoice.');
  // Emails the invoice or a reminder with the secure payment link. Only reachable when BETA_EMAIL_ENABLED is on.
  const sendEmail = async (i: Inv, reminder: boolean, v?: EmailValues) => {
    if (!BETA_EMAIL_ENABLED) { fail('Client email is turned off in beta.'); return; }
    setBusy(true); fail('');
    try {
      if (reminder && i.status === 'draft') throw new Error('Issue the draft invoice before sending a reminder.');
      if (i.status === 'draft') await patch(i, { status: 'sent' });
      const r = await fetch(`/api/admin/invoices/${i.id}/payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email: true, email_mode: reminder ? 'reminder' : 'invoice', email_from: v && v.from !== 'auto' ? v.from : undefined, email_to: v?.to, email_subject: v?.subject, email_message: v?.message }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Could not send invoice.');
      if (j.email_status !== 'sent') throw new Error(typeof j.email_error === 'string' && j.email_error.trim() ? j.email_error.trim() : j.email_status === 'no_email' ? 'This customer does not have an email address.' : j.email_status === 'failed' ? 'The email provider could not deliver this message.' : 'Email delivery is not configured.');
      await reload();
      setEmailing(null);
      setMsg(reminder ? `Reminder sent for ${i.number}.` : `${i.number} sent.`);
    } catch (e) { fail(e instanceof Error ? e.message : 'Could not send invoice.'); } finally { setBusy(false); }
  };
  const voidIt = (i: Inv) => {
    if (!window.confirm(`Void ${i.number ?? 'this invoice'}? This keeps the record but removes it from open receivables.`)) return;
    void run(async () => { await patch(i, { status: 'void' }); return `${i.number} voided.`; }, 'Could not void invoice.');
  };
  const del = (i: Inv) => {
    const typed = window.prompt(`Permanent deletion cannot be undone. Type this invoice ID to delete it:\n${i.id}`);
    if (typed !== i.id) { fail('Invoice was not deleted: the typed ID did not match.'); return; }
    void run(async () => {
      const r = await fetch(`/api/admin/invoices/${i.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permanent: true, confirmation_id: typed }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Could not delete draft.');
      return 'Invoice permanently deleted.';
    }, 'Could not delete draft.');
  };
  const task = (i: Inv) => {
    const note = window.prompt(`Task for ${i.number ?? 'invoice'}:`);
    if (!note?.trim()) return;
    const stamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date());
    void run(async () => { await patch(i, { memo: [i.memo, `Task (${stamp}): ${note.trim()}`].filter(Boolean).join('\n') }); return `Task added to ${i.number}.`; }, 'Could not create task.');
  };
  const print = (i: Inv, packing = false) => {
    const url = `/admin/billing-hub/invoice/${i.id}/preview${packing ? '?packing=1' : ''}`;
    if (isNative() || window.matchMedia('(max-width: 767px)').matches) window.location.assign(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  const batch = async (action: Batch | '') => {
    if (!action) return;
    setBusy(true); fail('');
    try {
      const r = await fetch('/api/admin/invoices', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Could not validate the selected invoices.');
      const targets = ((j.invoices ?? []) as Inv[]).filter((i) => sel.has(i.id));
      if (!targets.length) throw new Error('The selected invoices are no longer available. Select them again.');
      if ((action === 'send' || action === 'remind') && !BETA_EMAIL_ENABLED) throw new Error('Client email is turned off in beta.');
      const verb = { issue: 'Issue (no email)', send: 'Email', remind: 'Send reminders for', print: 'Print', void: 'Void', delete: 'Delete selected drafts' }[action];
      if (!window.confirm(`${verb} ${targets.length} selected invoice${targets.length === 1 ? '' : 's'}?`)) return;
      if (action === 'print') { targets.forEach((i) => print(i)); return; }
      let ok = 0; const bad: string[] = [];
      for (const i of targets) {
        const label = i.number ?? i.id.slice(0, 8);
        try {
          if (action === 'delete') {
            if (i.status !== 'draft') throw new Error('not a draft');
            const d = await fetch(`/api/admin/invoices/${i.id}`, { method: 'DELETE' });
            if (!d.ok) throw new Error((await d.json().catch(() => ({}))).error ?? 'delete failed');
          } else if (action === 'void') {
            if (['paid', 'void'].includes(i.status)) throw new Error(`status is ${i.status}`);
            await patch(i, { status: 'void' });
          } else if (action === 'send' || action === 'remind') {
            if (['paid', 'void'].includes(i.status)) throw new Error(`status is ${i.status}`);
            if (action === 'remind' && i.status === 'draft') throw new Error('draft invoices cannot receive reminders');
            if (action === 'send' && i.status === 'draft') await patch(i, { status: 'sent' });
            const m = await fetch(`/api/admin/invoices/${i.id}/payment-link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ send_email: true, email_mode: action === 'remind' ? 'reminder' : 'invoice' }) });
            const mj = await m.json().catch(() => ({}));
            if (!m.ok || mj.email_status !== 'sent') throw new Error(mj.email_error ?? mj.error ?? mj.email_status ?? 'email was not sent');
          } else {
            if (i.status !== 'draft') throw new Error('not a draft');
            await patch(i, { status: 'sent' });
          }
          ok += 1;
        } catch (e) { bad.push(`${label}: ${e instanceof Error ? e.message : 'failed'}`); }
      }
      await reload();
      if (bad.length) setErr(`${ok} succeeded; ${bad.length} failed. ${bad.join(' | ')}`); else setMsg(`${ok} invoice${ok === 1 ? '' : 's'} updated.`);
    } catch (e) { fail(e instanceof Error ? e.message : 'Batch action failed.'); } finally { setBusy(false); }
  };

  const menu = (i: Inv): MenuItem[] => {
    const closed = ['paid', 'void'].includes(i.status);
    return [
      { label: 'View/Edit', onClick: () => setEditing(i) },
      { label: 'View full invoice', onClick: () => { window.location.href = `/admin/billing-hub/invoice/${i.id}/preview`; } },
      { label: 'Receive payment', onClick: () => setPaying(i), disabled: closed },
      { label: 'Duplicate', onClick: () => void duplicate(i, false) },
      { label: 'Duplicate and edit', onClick: () => void duplicate(i, true) },
      { label: 'Issue invoice (no email)', onClick: () => void issue(i), disabled: i.status !== 'draft' },
      { label: BETA_EMAIL_ENABLED ? 'Send invoice' : 'Send invoice (email off in beta)', onClick: () => setEmailing({ invoice: i, reminder: false }), disabled: !BETA_EMAIL_ENABLED || closed },
      { label: BETA_EMAIL_ENABLED ? 'Send reminder' : 'Send reminder (email off in beta)', onClick: () => setEmailing({ invoice: i, reminder: true }), disabled: !BETA_EMAIL_ENABLED || closed || i.status === 'draft' },
      { label: 'Create payment link', onClick: () => setLinking(i), disabled: closed || i.status === 'draft' },
      { label: 'Create sales receipt', onClick: () => setReceipt(true) },
      { label: 'Copy invoice link', onClick: () => setSharing(i), disabled: closed || i.status === 'draft' },
      { label: 'Create task', onClick: () => task(i) },
      { label: 'Print', onClick: () => print(i) },
      { label: 'Print packing slip', onClick: () => print(i, true) },
      { label: 'View activity', onClick: () => setActivity(i) },
      { label: 'Void', onClick: () => voidIt(i), disabled: closed, danger: true },
      { label: 'Delete', onClick: () => del(i), disabled: i.status !== 'draft', danger: true },
    ];
  };

  if (loadError) return <div className={A.error}>{loadError}</div>;
  if (!rows) return <p className="text-sm text-[color:var(--ds-body)]">Loading invoices…</p>;

  const firstUnpaid = list.find((i) => !['draft', 'paid', 'void'].includes(i.status) && outstandingCents(i) > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className={`${A.card} p-5`}>
          <div className="mb-2 text-sm font-semibold text-[color:var(--ds-ink)]">{formatCents(summary.openAmt)} Unpaid</div>
          <div className="grid grid-cols-2 gap-4"><Metric amount={summary.overAmt} count={summary.overN} label="overdue" /><Metric amount={summary.notDueAmt} count={summary.notDueN} label="not due yet" /></div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[color:var(--ds-line)]" aria-hidden="true"><div className="bg-red-500" style={{ width: `${summary.openAmt ? (summary.overAmt / summary.openAmt) * 100 : 0}%` }} /></div>
        </div>
        <div className={`${A.card} p-5`}>
          <div className="mb-2 text-sm font-semibold text-[color:var(--ds-ink)]">{formatCents(summary.paidAmt)} Paid <span className="ml-1 text-xs font-normal text-[color:var(--ds-body)]">Last 30 days</span></div>
          <div className="grid grid-cols-2 gap-4"><Metric amount={summary.otherAmt} count={summary.otherN} label="other payments" /><Metric amount={summary.stripeAmt} count={summary.stripeN} label="Stripe payments" /></div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[color:var(--ds-line)]" aria-hidden="true"><div className="bg-green-600" style={{ width: `${summary.paidAmt ? (summary.otherAmt / summary.paidAmt) * 100 : 0}%` }} /></div>
        </div>
      </div>

      {(msg || err) && <div role="status" className={err ? A.error : A.notice}>{err || msg}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={q} onChange={(v) => reset(() => setQ(v))} label="Search invoices" />
        <select aria-label="Status" value={status} onChange={(e) => reset(() => setStatus(e.target.value as StatusFilter))} className={SELECT}>
          {([['all', 'All statuses'], ['scheduled', 'Scheduled'], ['draft', 'Draft'], ['open', 'Open'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['void', 'Void']] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Date" value={dates} onChange={(e) => reset(() => setDates(e.target.value as DateFilter))} className={SELECT}>
          {([['all', 'All dates'], ['today', 'Today'], ['30-days', 'Last 30 days'], ['3-months', 'Last 3 months'], ['12-months', 'Last 12 months']] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select aria-label="Type" value={kind} onChange={(e) => reset(() => setKind(e.target.value as TypeFilter))} className={SELECT}>
          <option value="all">All types</option><option value="invoice">Invoices</option><option value="receipt">Sales receipts</option>
        </select>
        <select aria-label="Errors" value={errors} onChange={(e) => reset(() => setErrors(e.target.value as ErrorFilter))} className={SELECT}>
          <option value="all">Errors</option><option value="missing-email">Missing email</option><option value="past-due">Past due</option>
        </select>
        <select aria-label="Batch actions" value="" disabled={busy || sel.size === 0} onChange={(e) => void batch(e.target.value as Batch)} className={SELECT}>
          <option value="">{sel.size ? `Batch actions (${sel.size})` : 'Batch actions'}</option>
          <option value="issue">Issue drafts (no email)</option>
          <option value="send" disabled={!BETA_EMAIL_ENABLED}>{BETA_EMAIL_ENABLED ? 'Send invoices' : 'Send invoices (email off in beta)'}</option>
          <option value="remind" disabled={!BETA_EMAIL_ENABLED}>{BETA_EMAIL_ENABLED ? 'Send reminders' : 'Send reminders (email off in beta)'}</option><option value="print">Print</option><option value="void">Void</option><option value="delete">Delete drafts</option>
        </select>
      </div>

      {createSlot && createPortal(
        <div className="relative flex">
          <button type="button" className={`${A.primary} rounded-r-none`} onClick={() => setCreating({ advertiser_id: null, agreement_id: '', amount_cents: null })}>Create invoice</button>
          <button type="button" aria-label="More create actions" className={`${A.primary} -ml-px rounded-l-none px-3`} onClick={() => setCreateMenu((o) => !o)}>&#9660;</button>
          {createMenu && (
            <div className="absolute right-0 top-11 z-30 w-52 rounded-[12px] border border-[color:var(--ds-line)] bg-white py-1 shadow-lg">
              <button type="button" style={{ background: 'transparent', border: 0 }} className="block w-full px-4 py-2 text-left text-sm hover:bg-[color:var(--ds-page)]" onClick={() => { setCreateMenu(false); if (firstUnpaid) setLinking(firstUnpaid); else fail('No unpaid invoice is available.'); }}>Create payment link</button>
              <button type="button" style={{ background: 'transparent', border: 0 }} className="block w-full px-4 py-2 text-left text-sm hover:bg-[color:var(--ds-page)]" onClick={() => { setCreateMenu(false); setReceipt(true); }}>Create sales receipt</button>
            </div>
          )}
        </div>
      , createSlot)}

      {status === 'scheduled' ? (
        <ScheduledInvoicesPanel drafts={shown} onEditDraft={(i) => setEditing(i)} onSendDraft={(i) => void issue(i)} />
      ) : shown.length === 0 ? <EmptyState title="No invoices found" body="Try a different search or filter." /> : (
        <div className="overflow-x-auto">
          <SortTable
            rows={shown} offset={cur * size} limit={size} className={A.table}
            cols={[
              { label: <input type="checkbox" aria-label="Select all shown invoices" checked={shown.length > 0 && shown.every((i) => sel.has(i.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((i) => i.id)) : new Set())} /> },
              { label: 'Date', get: (r) => txDate(r) },
              { label: 'Payment received', get: (r) => receivedDate(r) },
              { label: 'Type', get: (r) => (isReceipt(r) ? 'Sales receipt' : 'Invoice') },
              { label: 'No.', get: (r) => r.number },
              { label: 'Client', get: (r) => r.advertiser_name ?? r.bill_to_name },
              { label: 'Memo', get: (r) => memoOf(r) },
              { label: 'Amount', get: (r) => r.total_cents, className: 'text-right' },
              { label: 'Status', get: (r) => statusText(r, now) },
              { label: <span className="sr-only">Actions</span> },
            ]}
          >
            {(rws) => (<>
              {rws.map((i) => (
                <tr key={i.id}>
                  <td><input type="checkbox" aria-label={`Select ${i.number ?? 'invoice'}`} checked={sel.has(i.id)} onChange={() => setSel((c) => { const n = new Set(c); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })} /></td>
                  <td className="whitespace-nowrap">{day(txDate(i))}</td>
                  <td className="whitespace-nowrap">{day(receivedDate(i))}</td>
                  <td className="whitespace-nowrap">{isReceipt(i) ? 'Sales receipt' : 'Invoice'}</td>
                  <td className="max-w-[160px] truncate whitespace-nowrap font-medium text-[color:var(--ds-ink)]" title={i.number ?? undefined}><a href={`/admin/billing-hub/invoice/${i.id}/preview`} className="text-[color:var(--ds-primary)] hover:underline">{i.number ?? 'Draft'}</a></td>
                  <td className="max-w-[170px]">{i.advertiser_name ?? i.bill_to_name ?? '—'}</td>
                  <td className="max-w-[130px] truncate" title={memoOf(i)}>{memoOf(i) || '—'}</td>
                  <td className="whitespace-nowrap text-right font-medium">{formatCents(i.total_cents)}</td>
                  <td><StatusChip i={i} now={now} /></td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" disabled={busy} className={`${A.small} mr-2`} onClick={() => setEditing(i)}>View/Edit</button>
                    <RowMenu items={menu(i)} label={`More actions for ${i.number ?? 'invoice'}`} />
                  </td>
                </tr>
              ))}
            </>)}
          </SortTable>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[color:var(--ds-body)]">
        <div className="font-semibold text-[color:var(--ds-ink)]">Total due {formatCents(totalDue)}</div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">Rows
            <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(0); }} className={SELECT}>{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <span>{shown.length ? `${cur * size + 1}–${Math.min((cur + 1) * size, shown.length)} of ${shown.length}` : '0 results'}</span>
          <button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(0)}>First</button>
          <button type="button" className={A.small} disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
          <button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
          <button type="button" className={A.small} disabled={cur >= pages - 1} onClick={() => setPage(pages - 1)}>Last</button>
        </div>
      </div>

      {creating && <InvoiceDrawer advertisers={advertisers} agreements={agreements} seed={creating} onClose={() => setCreating(null)} onSaved={async () => { await reload(); setCreating(null); setErr(''); setMsg('Invoice saved.'); }} onRecordPayment={(i) => { setCreating(null); setPaying(i); }} onError={fail} />}
      {editing && <InvoiceDrawer existing={editing} advertisers={advertisers} agreements={agreements} onClose={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null); setErr(''); setMsg('Invoice saved.'); }} onRecordPayment={(i) => { setEditing(null); setPaying(i); }} onError={fail} />}
      {paying && <RecordPaymentDrawer invoices={list} advertisers={advertisers} initialInvoiceId={paying.id} onClose={() => setPaying(null)} onSaved={reload} onError={fail} />}
      {linking && <PaymentLinkDrawer noEmail={!BETA_EMAIL_ENABLED} invoices={list} advertisers={advertisers} initialInvoiceId={linking.id} onClose={() => setLinking(null)} onSaved={reload} onError={fail} />}
      {receipt && <SalesReceiptDrawer invoices={list} advertisers={advertisers} onClose={() => setReceipt(false)} onSaved={async () => { await reload(); setReceipt(false); setMsg('Sales receipt saved.'); }} onError={fail} />}
      {emailing && <EmailInvoiceDialog invoice={emailing.invoice} reminder={emailing.reminder} daysOver={daysOver(emailing.invoice, now)} busy={busy} onClose={() => setEmailing(null)} onSend={(v) => void sendEmail(emailing.invoice, emailing.reminder, v)} />}
      {sharing && <ShareLinkDialog invoice={sharing} onClose={() => setSharing(null)} onCreated={reload} onError={fail} />}
      {activity && <ActivityPanel invoice={activity} now={now} onClose={() => setActivity(null)} onEdit={() => { const i = activity; setActivity(null); setEditing(i); }} />}
    </div>
  );
}
