'use client';

// app/admin/billing/_components/InvoiceDrawer.tsx
//
// Create/edit drawer for a single invoice. Supports line items and a
// manual override amount.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser, InvoiceStatus, InvoiceLineItem, InvoiceAuditEntry, InvoicePayment } from '@/lib/invoices';
import { formatCents, lineItemsTotal, PAYMENT_METHODS, isCheckPayment } from '@/lib/invoices';
import { DrawerShell, DrawerFooter, Section, Field } from './DrawerShell';
import { INPUT, INV_STATUS } from './constants';
import { formatDateISO } from './helpers';
import type { AdvertiserOption } from './types';
import { ProductServiceSearch } from './ProductServiceSearch';
import { sparsePatch } from '@/lib/sparse-patch';

// Minimal shape of an agreement_line_items row, as returned by
// GET /api/admin/agreements/[id]/line-items.
type AgreementLineItemSeed = {
  line_no: number;
  channel: string | null;
  package_label: string | null;
  frequency: string | null;
  quantity: number | null;
  amount_cents: number | null;
};

function parseWeeks(freq: string | null | undefined): number {
  if (!freq) return 1;
  const m = String(freq).match(/(\d+)/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
}

function channelLabel(ch: string | null | undefined): string {
  return ch ? ch.charAt(0).toUpperCase() + ch.slice(1) : '';
}

function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarDayDifference(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

// Map an agreement bundle line to an invoice line item: description mirrors
// the CRM contract panel (e.g. "Feed Top Banner, 4 weeks x 1 market"), qty is
// the frequency in weeks, and the unit price is the line total / weeks
// (app Top Banner $380 / 4w = $95; e-Blast $600 / 4w = $150).
function agreementLineToInvoiceItem(li: AgreementLineItemSeed): InvoiceLineItem {
  const weeks = parseWeeks(li.frequency);
  const markets = li.quantity && li.quantity > 0 ? li.quantity : 1;
  const label = (li.package_label && li.package_label.trim())
    ? li.package_label
    : (channelLabel(li.channel) || `Line ${li.line_no}`);
  const total = li.amount_cents ?? 0;
  return {
    description: `${label}, ${weeks} weeks \u00d7 ${markets} market${markets > 1 ? 's' : ''}`,
    qty: weeks,
    unit_cents: Math.round(total / weeks),
  };
}

export function InvoiceDrawer({
  existing, advertisers, agreements, seed, onClose, onSaved, onRecordPayment, onError,
}: {
  existing?: InvoiceWithAdvertiser;
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  seed?: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRecordPayment?: (invoice: InvoiceWithAdvertiser) => void;
  onError: (msg: string) => void;
}) {
  const initialAdvertiserId = existing?.advertiser_id ?? seed?.advertiser_id ?? null;
  const initialAgreementId = (existing?.agreement_id ?? seed?.agreement_id ?? '') as string;
  const initialAdvertiser = advertisers.find((advertiser) => advertiser.id === initialAdvertiserId);
  const initialLineItems = existing?.line_items ?? [];
  const initialAmountDollars =
    initialLineItems.length > 0 ? ''
    : existing?.amount_cents != null ? (existing.amount_cents / 100).toString()
    : seed?.amount_cents != null ? (seed.amount_cents / 100).toString()
    : '';

  // Net 20 is based on the invoice's billing date, not the date this drawer
  // happens to be opened.
  const defaultBillingDate = formatDateISO(new Date());
  const defaultDueDate = addCalendarDays(defaultBillingDate, 20);

  const [form, setForm] = useState({
    number: existing ? (existing.number ?? '') : 'INV #16201',
    advertiser_id: initialAdvertiserId as number | null,
    agreement_id: initialAgreementId,
    status: (existing?.status ?? 'draft') as InvoiceStatus,
    amount_dollars: initialAmountDollars,
    tax_dollars: existing?.tax_cents != null ? (existing.tax_cents / 100).toString() : (existing ? '' : '0'),
    billing_date: existing?.issued_at
      ? formatDateISO(existing.issued_at as string | Date)
      : (existing ? '' : defaultBillingDate),
    due_date: existing?.due_date
      ? formatDateISO(existing.due_date as string | Date)
      : (existing ? '' : defaultDueDate),
    memo: existing?.memo ?? (seed ? 'Generated from agreement' : ''),
    bill_to_email: existing?.bill_to_email ?? initialAdvertiser?.billing_email ?? initialAdvertiser?.contact_email ?? '',
    line_items: initialLineItems as InvoiceLineItem[],
  });
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<InvoiceWithAdvertiser | null>(existing ?? null);
  const [historyLoading, setHistoryLoading] = useState(Boolean(existing));
  const isCreate = !existing;

  useEffect(() => {
    if (!isCreate) return;
    let alive = true;
    fetch('/api/admin/invoices?next_number=1')
      .then((response) => response.ok ? response.json() : { next_number: 'INV #16201' })
      .then((data: { next_number?: string }) => {
        if (!alive || !data.next_number) return;
        setForm((current) => ({ ...current, number: data.next_number ?? current.number }));
      })
      .catch(() => { /* Keep INV #16201 as the safe starting number. */ });
    return () => { alive = false; };
  }, [isCreate]);

  useEffect(() => {
    if (!existing) return;
    let alive = true;
    fetch(`/api/admin/invoices/${existing.id}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? 'Could not load invoice history');
        return data.invoice as InvoiceWithAdvertiser;
      })
      .then((invoice) => {
        if (alive) setDetail(invoice);
      })
      .catch((error) => {
        if (alive) onError(error instanceof Error ? error.message : 'Could not load invoice history');
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => { alive = false; };
  }, [existing, onError]);

  // Merge a payment corrected in the history list back into the loaded detail
  // so the row keeps its new tender if the drawer re-renders.
  const handlePaymentPatched = useCallback((updated: InvoicePayment) => {
    setDetail((current) => {
      if (!current?.payments) return current;
      return {
        ...current,
        payments: current.payments.map((payment) => (payment.id === updated.id ? { ...payment, ...updated } : payment)),
      };
    });
  }, []);

  // Pre-populate line items from the linked agreement so a bundle (e.g. app
  // Top Banner + e-Blast) itemizes into the invoice instead of a flat amount.
  // Only fills when empty (never clobbers user edits) and lets the lines
  // drive the total by clearing the manual override.
  useEffect(() => {
    if (!isCreate) return;
    const aid = form.agreement_id;
    if (!aid) return;
    let alive = true;
    fetch(`/api/admin/agreements/${aid}/line-items`)
      .then((r) => (r.ok ? r.json() : { lineItems: [] }))
      .then((d: { lineItems?: AgreementLineItemSeed[] }) => {
        if (!alive) return;
        const items = (d.lineItems ?? []).map(agreementLineToInvoiceItem);
        if (items.length === 0) return;
        setForm((f) => (f.line_items.length > 0 ? f : { ...f, line_items: items, amount_dollars: '' }));
      })
      .catch(() => { /* best-effort; manual amount remains */ });
    return () => { alive = false; };
  }, [isCreate, form.agreement_id]);


  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const updateBillingDate = (billingDate: string) => {
    setForm((current) => {
      const existingTermDays = calendarDayDifference(current.billing_date, current.due_date);
      const termDays = existingTermDays !== null && existingTermDays >= 0 ? existingTermDays : 20;
      return {
        ...current,
        billing_date: billingDate,
        due_date: billingDate ? addCalendarDays(billingDate, termDays) : '',
      };
    });
  };

  const updateLineItems = (lineItems: InvoiceLineItem[]) =>
    setForm((f) => ({ ...f, line_items: lineItems, amount_dollars: '' }));

  const addLineItem = () => updateLineItems([...form.line_items, { description: '', qty: 1, unit_cents: 0 }]);
  const removeLineItem = (i: number) => updateLineItems(form.line_items.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, key: keyof InvoiceLineItem, val: string | number) =>
    updateLineItems(form.line_items.map((li, idx) => idx === i ? { ...li, [key]: typeof val === 'number' ? val : (key === 'description' ? val : Number(val) || 0) } : li));

  const linesTotal = lineItemsTotal(form.line_items);
  const effectiveAmount = form.amount_dollars ? Math.round(parseFloat(form.amount_dollars) * 100) : linesTotal;

  const matchingAgreements = useMemo(
    () => agreements.filter((a) => !form.advertiser_id || a.advertiser_id === form.advertiser_id),
    [agreements, form.advertiser_id],
  );

  const submit = async () => {
    if (isCreate && !form.advertiser_id) { onError('partner required'); return; }
    setSaving(true);
    try {
      const lineItemsChanged = Boolean(
        existing && JSON.stringify(form.line_items) !== JSON.stringify(existing.line_items ?? []),
      );
      const payload: Record<string, unknown> = {
        number: form.number.trim() || null,
        advertiser_id: form.advertiser_id,
        agreement_id: form.agreement_id || null,
        status: form.status,
        amount_cents: form.amount_dollars
          ? Math.round(parseFloat(form.amount_dollars) * 100)
          : (existing && !lineItemsChanged ? existing.amount_cents : (form.line_items.length > 0 ? linesTotal : null)),
        tax_cents: form.tax_dollars ? Math.round(parseFloat(form.tax_dollars) * 100) : 0,
        issued_at: form.billing_date ? `${form.billing_date}T00:00:00.000Z` : null,
        due_date: form.due_date || null,
        memo: form.memo || null,
        bill_to_email: form.bill_to_email || null,
        line_items: form.line_items,
      };
      const initialPayload: Record<string, unknown> | null = existing ? {
        number: existing.number ?? null,
        advertiser_id: existing.advertiser_id,
        agreement_id: existing.agreement_id ?? null,
        status: existing.status,
        amount_cents: existing.amount_cents ?? null,
        tax_cents: existing.tax_cents ?? null,
        issued_at: existing.issued_at ? `${formatDateISO(existing.issued_at as string | Date)}T00:00:00.000Z` : null,
        due_date: existing.due_date ? formatDateISO(existing.due_date as string | Date) : null,
        memo: existing.memo ?? null,
        bill_to_email: existing.bill_to_email ?? null,
        line_items: existing.line_items ?? [],
      } : null;
      const requestBody = initialPayload ? sparsePatch(payload, initialPayload) : payload;
      if (existing && Object.keys(requestBody).length === 0) {
        await onSaved();
        return;
      }
      const url = isCreate ? '/api/admin/invoices' : `/api/admin/invoices/${existing.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? data.detail ?? `Save failed (HTTP ${res.status})`);
      }
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const voidInvoice = async () => {
    if (!existing || existing.status === 'void') return;
    if (!window.confirm(`Void ${existing.number ?? 'this invoice'}? This preserves the financial record.`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/invoices/${existing.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'void' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not void invoice.');
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not void invoice.');
    } finally { setSaving(false); }
  };

  const permanentlyDelete = async () => {
    if (!existing) return;
    const confirmation = window.prompt(`Permanent deletion cannot be undone. Type this invoice ID to delete it:\n${existing.id}`);
    if (confirmation !== existing.id) { onError('Invoice was not deleted: the typed ID did not match.'); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/invoices/${existing.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permanent: true, confirmation_id: confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not permanently delete invoice.');
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not permanently delete invoice.');
    } finally { setSaving(false); }
  };

  return (
    <DrawerShell
      title={isCreate ? 'New invoice' : (existing?.number ?? 'Invoice')}
      subtitle={existing?.advertiser_name ?? 'Invoice number can be edited before saving'}
      onClose={onClose}
      wide
    >
      <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Linkage">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner">
            <select
              value={form.advertiser_id ?? ''}
              onChange={(e) => {
                const advertiserId = e.target.value ? +e.target.value : null;
                const advertiser = advertisers.find((item) => item.id === advertiserId);
                setForm((current) => ({
                  ...current,
                  advertiser_id: advertiserId,
                  bill_to_email: advertiser?.billing_email ?? advertiser?.contact_email ?? '',
                }));
              }}
              className={INPUT}
              disabled={!isCreate}
            >
              <option value="">— select —</option>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Agreement (optional)">
            <select value={form.agreement_id} onChange={(e) => update('agreement_id', e.target.value)} className={INPUT}>
              <option value="">— none —</option>
              {matchingAgreements.map((a) => (
                <option key={a.id} value={a.id}>
                  {(a.advertiser_name ?? '?')} · {a.type ?? ''} · {formatCents(a.amount_cents)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Line items" className="xl:col-span-2">
        {form.line_items.length === 0 && <div className="text-xs text-gray-500">No line items — invoice will use the manual amount below.</div>}
        {form.line_items.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <ProductServiceSearch
              className="col-span-6"
              value={li.description}
              onChange={(value) => updateLineItem(i, 'description', value)}
              onSelect={(item) => updateLineItems(form.line_items.map((line, index) => index === i ? {
                ...line,
                description: item.sales_description || item.name,
                unit_cents: item.price_cents ?? 0,
              } : line))}
            />
            <input className={`${INPUT} col-span-2`} value={li.qty} type="number" min={1} onChange={(e) => updateLineItem(i, 'qty', e.target.value)} />
            <input className={`${INPUT} col-span-3`} value={li.unit_cents / 100} type="number" step="0.01" onChange={(e) => updateLineItem(i, 'unit_cents', Math.round(parseFloat(e.target.value || '0') * 100))} placeholder="Unit $" />
            <button type="button" onClick={() => removeLineItem(i)} className="col-span-1 text-xs text-rose-600 hover:underline">×</button>
          </div>
        ))}
        <button type="button" onClick={addLineItem} className="text-xs text-orange-600 hover:underline">+ Add line item</button>
      </Section>

      <Section title="Amount &amp; status">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Invoice number">
            <input value={form.number} onChange={(e) => update('number', e.target.value)} className={INPUT} />
          </Field>
          <Field label={form.line_items.length > 0 ? 'Manual amount ($) — override' : 'Amount ($)'}>
            <input value={form.amount_dollars} onChange={(e) => update('amount_dollars', e.target.value)} className={INPUT} placeholder={form.line_items.length > 0 ? String(linesTotal / 100) : ''} inputMode="decimal" />
          </Field>
          <Field label="Tax ($)"><input value={form.tax_dollars} onChange={(e) => update('tax_dollars', e.target.value)} className={INPUT} inputMode="decimal" /></Field>
          <Field label="Billing date"><input type="date" value={form.billing_date} onChange={(e) => updateBillingDate(e.target.value)} className={INPUT} /></Field>
          <Field label="Due date"><input type="date" value={form.due_date} onChange={(e) => update('due_date', e.target.value)} className={INPUT} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => update('status', e.target.value as InvoiceStatus)} className={INPUT}>
              {INV_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="text-xs text-gray-600">
          Preview total: <span className="font-medium text-gray-900">{formatCents(effectiveAmount + (form.tax_dollars ? Math.round(parseFloat(form.tax_dollars) * 100) : 0))}</span>
        </div>
      </Section>

      <Section title="Memo">
        <div className="grid gap-3">
          <Field label="Bill-to email">
            <input
              type="email"
              value={form.bill_to_email}
              onChange={(e) => update('bill_to_email', e.target.value)}
              className={INPUT}
              placeholder="Defaults to the partner billing email"
            />
          </Field>
          <textarea value={form.memo} onChange={(e) => update('memo', e.target.value)} rows={2} className={INPUT + ' resize-y'} />
        </div>
      </Section>

      {existing && (
        <Section title="Final invoice">
          <a
            href={`/admin/invoices/${existing.id}/preview`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
          >
            Preview final invoice
          </a>
          <p className="text-xs text-gray-500">
            Opens the customer-facing Caxton invoice in a print-ready view.
          </p>
        </Section>
      )}
      {existing && (
        <InvoiceHistory
          invoice={detail ?? existing}
          loading={historyLoading}
          onRecordPayment={onRecordPayment ? () => onRecordPayment(detail ?? existing) : undefined}
          onPaymentPatched={handlePaymentPatched}
          onPaymentDeleted={(paymentId) => setDetail((current) => current ? { ...current, payments: (current.payments ?? []).filter((payment) => payment.id !== paymentId) } : current)}
        />
      )}
      </div>

      {existing && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
          <p className="text-xs text-gray-500">Void preserves the record. Permanent delete requires the invoice ID.</p>
          <div className="flex gap-2">
            {existing.status !== 'void' && <button type="button" disabled={saving} onClick={() => void voidInvoice()} className="rounded border border-orange-300 px-3 py-2 text-sm font-medium text-orange-800 hover:bg-orange-50 disabled:opacity-50">Void invoice</button>}
            <button type="button" disabled={saving} onClick={() => void permanentlyDelete()} className="rounded border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">Permanent delete</button>
          </div>
        </div>
      )}
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel={isCreate ? 'Create' : 'Save changes'} tone="orange" />
    </DrawerShell>
  );
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  agreement_id: 'agreement',
  number: 'invoice number',
  amount_cents: 'amount',
  tax_cents: 'tax',
  status: 'status',
  issued_at: 'issue date',
  due_date: 'due date',
  paid_at: 'paid date',
  voided_at: 'voided date',
  bill_to_name: 'bill-to name',
  bill_to_email: 'bill-to email',
  bill_to_address: 'bill-to address',
  memo: 'memo',
  line_items: 'line items',
};

function historyDate(value: string | null | undefined) {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * One recorded payment, with an editable payment type and reference.
 *
 * Saves each change straight to PATCH /api/admin/invoice-payments/[id] so a
 * mistyped tender can be corrected without voiding and re-recording. Amount
 * and invoice linkage stay read-only here — those move a balance.
 */
function PaymentHistoryRow({
  payment,
  onPatched,
  onDeleted,
}: {
  payment: InvoicePayment;
  onPatched: (payment: InvoicePayment) => void;
  onDeleted: (paymentId: string) => void;
}) {
  const [method, setMethod] = useState(payment.payment_method ?? '');
  const [reference, setReference] = useState(payment.reference ?? '');
  const [paymentDate, setPaymentDate] = useState(formatDateISO(payment.payment_date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Historical rows may hold a tender outside the canonical list (e.g. imported
  // from QuickBooks). Keep that value selectable so saving never rewrites it.
  const options = useMemo(() => {
    const list: string[] = [...PAYMENT_METHODS];
    if (method && !list.includes(method)) list.unshift(method);
    return list;
  }, [method]);

  const patch = async (body: { payment_method?: string; reference?: string; payment_date?: string }) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/admin/invoice-payments/${payment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not update payment.');
      onPatched(data.payment as InvoicePayment);
      setSaved(true);
    } catch (patchError) {
      setMethod(payment.payment_method ?? '');
      setReference(payment.reference ?? '');
      setPaymentDate(formatDateISO(payment.payment_date));
      setError(patchError instanceof Error ? patchError.message : 'Could not update payment.');
    } finally {
      setSaving(false);
    }
  };

  const referenceLabel = isCheckPayment(method) ? 'Check no.' : 'Reference';
  const deletePayment = async () => {
    const confirmation = window.prompt(`Permanent deletion cannot be undone. Type this payment ID to delete it:\n${payment.id}`);
    if (confirmation !== payment.id) { setError('Payment was not deleted: the typed ID did not match.'); return; }
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/admin/invoice-payments/${payment.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ permanent: true, confirmation_id: confirmation }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not permanently delete payment.');
      onDeleted(payment.id);
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : 'Could not permanently delete payment.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="grid gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">Payment type</span>
              <select
                className={`${INPUT} mt-0.5`}
                value={method}
                disabled={saving}
                onChange={(event) => {
                  const next = event.target.value;
                  setMethod(next);
                  void patch({ payment_method: next });
                }}
              >
                {!method && <option value="">Unspecified</option>}
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">{referenceLabel}</span>
              <input
                className={`${INPUT} mt-0.5`}
                value={reference}
                disabled={saving}
                placeholder="—"
                onChange={(event) => setReference(event.target.value)}
                onBlur={() => {
                  if (reference.trim() === (payment.reference ?? '').trim()) return;
                  void patch({ reference });
                }}
              />
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Payment received</span>
              <input
                type="date"
                className={`${INPUT} mt-0.5`}
                value={paymentDate}
                disabled={saving}
                onChange={(event) => setPaymentDate(event.target.value)}
                onBlur={() => {
                  if (paymentDate === formatDateISO(payment.payment_date)) return;
                  void patch({ payment_date: paymentDate });
                }}
              />
            </label>
          </div>
          {payment.memo && <div className="mt-1.5 text-xs text-gray-600">{payment.memo}</div>}
          <div className="mt-1 text-xs text-gray-500">
            {historyDate(payment.payment_date)}{payment.created_by ? ` · ${payment.created_by}` : ''}
            {saving && <span className="ml-1 text-gray-400">· saving…</span>}
            {saved && !saving && <span className="ml-1 text-emerald-700">· saved</span>}
          </div>
          {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}
        </div>
        <div className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700">{formatCents(payment.amount_cents)}</div>
      </div>
      <button type="button" disabled={saving} onClick={() => void deletePayment()} className="mt-2 text-xs font-medium text-rose-700 hover:underline disabled:opacity-50">Permanent delete payment</button>
    </div>
  );
}

function auditDescription(entry: InvoiceAuditEntry) {
  const fields = (entry.fields ?? []).map((field) => AUDIT_FIELD_LABELS[field] ?? field.replaceAll('_', ' '));
  return fields.length ? `Changed ${fields.join(', ')}` : 'Invoice updated';
}

function InvoiceHistory({
  invoice,
  loading,
  onRecordPayment,
  onPaymentPatched,
  onPaymentDeleted,
}: {
  invoice: InvoiceWithAdvertiser;
  loading: boolean;
  onRecordPayment?: () => void;
  onPaymentPatched: (payment: InvoicePayment) => void;
  onPaymentDeleted: (paymentId: string) => void;
}) {
  const payments = invoice.payments ?? [];
  const auditLog = [...(invoice.audit_log ?? [])].reverse();
  const amountPaid = invoice.amount_paid_cents ?? payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const balance = invoice.balance_cents ?? Math.max(invoice.total_cents - amountPaid, 0);

  return (
    <Section title="Payments & activity" className="xl:col-span-2">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['Invoice total', invoice.total_cents],
          ['Payments recorded', amountPaid],
          ['Open balance', balance],
        ].map(([label, cents]) => (
          <div key={String(label)} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">{formatCents(Number(cents))}</div>
          </div>
        ))}
      </div>

      {onRecordPayment && balance > 0 && invoice.status !== 'void' && (
        <button
          type="button"
          onClick={onRecordPayment}
          className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"
        >
          Record payment
        </button>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-md border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">Payment history</div>
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-500">Loading payments…</div>
          ) : payments.length ? (
            <div className="divide-y divide-gray-200">
              {[...payments].reverse().map((payment) => (
              <PaymentHistoryRow key={payment.id} payment={payment} onPatched={onPaymentPatched} onDeleted={onPaymentDeleted} />
              ))}
            </div>
          ) : (
            <div className="px-3 py-4 text-sm text-gray-500">No payments have been recorded.</div>
          )}
        </div>

        <div className="overflow-hidden rounded-md border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-600">Change history</div>
          {loading ? (
            <div className="px-3 py-4 text-sm text-gray-500">Loading changes…</div>
          ) : (
            <div className="divide-y divide-gray-200">
              {auditLog.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className="px-3 py-3">
                  <div className="text-sm font-medium text-gray-900">{auditDescription(entry)}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {historyDate(entry.timestamp)}{entry.user_email ? ` · ${entry.user_email}` : ''}
                  </div>
                </div>
              ))}
              <div className="px-3 py-3">
                <div className="text-sm font-medium text-gray-900">Invoice created</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {historyDate(invoice.created_at)}{invoice.created_by ? ` · ${invoice.created_by}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}
