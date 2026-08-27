'use client';

// app/admin/billing/_components/InvoiceDrawer.tsx
//
// Create/edit drawer for a single invoice. Supports line items and a
// manual override amount.

import { useEffect, useMemo, useState } from 'react';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser, InvoiceStatus, InvoiceLineItem } from '@/lib/invoices';
import { formatCents, lineItemsTotal } from '@/lib/invoices';
import { DrawerShell, DrawerFooter, Section, Field } from './DrawerShell';
import { INPUT, INV_STATUS } from './constants';
import { formatDateISO } from './helpers';
import type { AdvertiserOption } from './types';

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
  existing, advertisers, agreements, seed, onClose, onSaved, onError,
}: {
  existing?: InvoiceWithAdvertiser;
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  seed?: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const initialAdvertiserId = existing?.advertiser_id ?? seed?.advertiser_id ?? null;
  const initialAgreementId = (existing?.agreement_id ?? seed?.agreement_id ?? '') as string;
  const initialAmountDollars =
    existing?.amount_cents != null ? (existing.amount_cents / 100).toString()
    : seed?.amount_cents != null ? (seed.amount_cents / 100).toString()
    : '';

  // Net 20: default a new invoice's due date to creation date + 20 days.
  // new Date() in render is permitted (cf. AgreementDrawer); Date.now() is not.
  const dueIn20 = new Date();
  dueIn20.setDate(dueIn20.getDate() + 20);
  const defaultDueDate = formatDateISO(dueIn20);

  const [form, setForm] = useState({
    advertiser_id: initialAdvertiserId as number | null,
    agreement_id: initialAgreementId,
    status: (existing?.status ?? 'draft') as InvoiceStatus,
    amount_dollars: initialAmountDollars,
    tax_dollars: existing?.tax_cents != null ? (existing.tax_cents / 100).toString() : '0',
    due_date: existing?.due_date
      ? formatDateISO(existing.due_date as string | Date)
      : defaultDueDate,
    memo: existing?.memo ?? (seed ? 'Generated from agreement' : ''),
    line_items: existing?.line_items ?? [] as InvoiceLineItem[],
  });
  const [saving, setSaving] = useState(false);
  const isCreate = !existing;

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

  const addLineItem = () => update('line_items', [...form.line_items, { description: '', qty: 1, unit_cents: 0 }]);
  const removeLineItem = (i: number) => update('line_items', form.line_items.filter((_, idx) => idx !== i));
  const updateLineItem = (i: number, key: keyof InvoiceLineItem, val: string | number) =>
    update('line_items', form.line_items.map((li, idx) => idx === i ? { ...li, [key]: typeof val === 'number' ? val : (key === 'description' ? val : Number(val) || 0) } : li));

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
      const payload: Record<string, unknown> = {
        advertiser_id: form.advertiser_id,
        agreement_id: form.agreement_id || null,
        status: form.status,
        amount_cents: form.amount_dollars ? Math.round(parseFloat(form.amount_dollars) * 100) : (form.line_items.length > 0 ? linesTotal : null),
        tax_cents: form.tax_dollars ? Math.round(parseFloat(form.tax_dollars) * 100) : 0,
        due_date: form.due_date || null,
        memo: form.memo || null,
        line_items: form.line_items,
      };
      const url = isCreate ? '/api/admin/invoices' : `/api/admin/invoices/${existing.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      title={isCreate ? 'New invoice' : (existing?.number ?? 'Invoice')}
      subtitle={existing?.advertiser_name ?? 'Auto-numbered on save'}
      onClose={onClose}
    >
      <Section title="Linkage">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner">
            <select value={form.advertiser_id ?? ''} onChange={(e) => update('advertiser_id', e.target.value ? +e.target.value : null)} className={INPUT} disabled={!isCreate}>
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

      <Section title="Line items">
        {form.line_items.length === 0 && <div className="text-xs text-gray-500">No line items — invoice will use the manual amount below.</div>}
        {form.line_items.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input className={`${INPUT} col-span-6`} value={li.description} placeholder="Description" onChange={(e) => updateLineItem(i, 'description', e.target.value)} />
            <input className={`${INPUT} col-span-2`} value={li.qty} type="number" min={1} onChange={(e) => updateLineItem(i, 'qty', e.target.value)} />
            <input className={`${INPUT} col-span-3`} value={li.unit_cents / 100} type="number" step="0.01" onChange={(e) => updateLineItem(i, 'unit_cents', Math.round(parseFloat(e.target.value || '0') * 100))} placeholder="Unit $" />
            <button type="button" onClick={() => removeLineItem(i)} className="col-span-1 text-xs text-rose-600 hover:underline">×</button>
          </div>
        ))}
        <button type="button" onClick={addLineItem} className="text-xs text-blue-600 hover:underline">+ Add line item</button>
      </Section>

      <Section title="Amount &amp; status">
        <div className="grid grid-cols-2 gap-3">
          <Field label={form.line_items.length > 0 ? 'Manual amount ($) — override' : 'Amount ($)'}>
            <input value={form.amount_dollars} onChange={(e) => update('amount_dollars', e.target.value)} className={INPUT} placeholder={form.line_items.length > 0 ? String(linesTotal / 100) : ''} inputMode="decimal" />
          </Field>
          <Field label="Tax ($)"><input value={form.tax_dollars} onChange={(e) => update('tax_dollars', e.target.value)} className={INPUT} inputMode="decimal" /></Field>
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
        <textarea value={form.memo} onChange={(e) => update('memo', e.target.value)} rows={2} className={INPUT + ' resize-y'} />
      </Section>

      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel={isCreate ? 'Create' : 'Save changes'} />
    </DrawerShell>
  );
}
