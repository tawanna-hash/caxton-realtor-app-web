'use client';

// app/admin/ar/RecurringScheduleDrawer.tsx
//
// Create/edit drawer for a recurring invoice schedule. Works for both
// agreement-linked (agreement_id set, locked) and standalone schedules
// (advertiser + agreement picked freely).

import { useMemo, useState } from 'react';
import {
  frequencyLabel,
  type RecurringScheduleWithAdvertiser,
  type RecurringFrequency,
} from '@/lib/recurring-invoices';
import type { InvoiceLineItem } from '@/lib/invoices';
import { formatCents, lineItemsTotal } from '@/lib/invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import { DrawerShell, DrawerFooter, Section, Field } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';

const FREQ_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
];

type Seed = {
  advertiser_id: number | null;
  agreement_id: string | null;
};

export function RecurringScheduleDrawer({
  existing, advertisers, agreements, seed, onClose, onSaved, onError,
}: {
  existing?: RecurringScheduleWithAdvertiser;
  advertisers: AdvertiserOption[];
  agreements: AgreementWithAdvertiser[];
  seed?: Seed;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (msg: string) => void;
}) {
  const isEdit = !!existing;
  const [advertiserId, setAdvertiserId] = useState<number | null>(existing?.advertiser_id ?? seed?.advertiser_id ?? null);
  const [agreementId, setAgreementId] = useState<string>(existing?.agreement_id ?? seed?.agreement_id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(existing?.frequency ?? 'monthly');
  const [intervalCount, setIntervalCount] = useState<number>(existing?.interval_count ?? 1);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(existing?.line_items?.length ? existing.line_items : [{ description: '', qty: 1, unit_cents: 0 }]);
  const [taxCents, setTaxCents] = useState<number>(existing?.tax_cents ?? 0);
  const [dueDays, setDueDays] = useState<number>(existing?.due_days ?? 15);
  const [createDaysInAdvance, setCreateDaysInAdvance] = useState<number>(existing?.create_days_in_advance ?? 0);
  const [autoSend, setAutoSend] = useState<boolean>(existing?.auto_send ?? true);
  const [startDate, setStartDate] = useState<string>(existing?.start_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(existing?.end_date?.slice(0, 10) ?? '');
  const [maxOccurrences, setMaxOccurrences] = useState<string>(existing?.max_occurrences != null ? String(existing.max_occurrences) : '');
  const [endMode, setEndMode] = useState<'never' | 'after' | 'date'>(
    existing?.max_occurrences != null ? 'after' : existing?.end_date ? 'date' : 'never',
  );
  const [memo, setMemo] = useState(existing?.memo ?? '');
  const [billToName, setBillToName] = useState(existing?.bill_to_name ?? '');
  const [billToEmail, setBillToEmail] = useState(existing?.bill_to_email ?? '');
  const [saving, setSaving] = useState(false);

  const total = useMemo(() => lineItemsTotal(lineItems) + (taxCents || 0), [lineItems, taxCents]);

  const agreementOptions = useMemo(
    () => agreements.filter((a) => !advertiserId || a.advertiser_id === advertiserId),
    [agreements, advertiserId],
  );

  function updateLine(i: number, patch: Partial<InvoiceLineItem>) {
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }
  function addLine() {
    setLineItems((prev) => [...prev, { description: '', qty: 1, unit_cents: 0 }]);
  }
  function removeLine(i: number) {
    setLineItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (!advertiserId) { onError('Select a partner'); return; }
    if (!name.trim()) { onError('Name is required'); return; }
    if (total <= 0) { onError('Amount must be greater than $0'); return; }

    setSaving(true);
    onError('');
    const payload = {
      advertiser_id: advertiserId,
      agreement_id: agreementId || null,
      name: name.trim(),
      frequency,
      interval_count: intervalCount,
      line_items: lineItems.filter((li) => li.description.trim() || li.unit_cents),
      tax_cents: taxCents,
      due_days: dueDays,
      create_days_in_advance: createDaysInAdvance,
      auto_send: autoSend,
      start_date: startDate,
      end_date: endMode === 'date' && endDate ? endDate : null,
      max_occurrences: endMode === 'after' && maxOccurrences ? Number(maxOccurrences) : null,
      memo: memo || null,
      bill_to_name: billToName || null,
      bill_to_email: billToEmail || null,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/admin/recurring-invoices/${existing!.id}` : '/api/admin/recurring-invoices',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        onError(j.error ?? 'Save failed');
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      onError('Network error while saving');
      setSaving(false);
    }
  }

  return (
    <DrawerShell
      title={isEdit ? 'Edit recurring schedule' : 'New recurring schedule'}
      subtitle={isEdit ? existing!.advertiser_name ?? undefined : undefined}
      onClose={onClose}
    >
      <Section title="Recurring invoice template">
        <Field label="Name">
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly banner ad" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Partner">
            <select
              className={INPUT}
              value={advertiserId ?? ''}
              disabled={isEdit}
              onChange={(e) => { setAdvertiserId(e.target.value ? Number(e.target.value) : null); setAgreementId(''); }}
            >
              <option value="">Select…</option>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Linked agreement (optional)">
            <select className={INPUT} value={agreementId} disabled={isEdit} onChange={(e) => setAgreementId(e.target.value)}>
              <option value="">Standalone (no agreement)</option>
              {agreementOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.advertiser_name} — {a.id.slice(0, 8)}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Frequency">
            <select className={INPUT} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
              {FREQ_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Every N periods">
            <input type="number" min={1} className={INPUT} value={intervalCount} onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Due days">
            <input type="number" min={0} className={INPUT} value={dueDays} onChange={(e) => setDueDays(Math.max(0, Number(e.target.value) || 0))} />
          </Field>
        </div>
      </Section>

      <Section title="Recurring schedule">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Start date">
            <input type="date" className={INPUT} value={startDate} disabled={isEdit} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Create invoice days in advance">
            <input
              type="number"
              min={0}
              className={INPUT}
              value={createDaysInAdvance}
              onChange={(e) => setCreateDaysInAdvance(Math.max(0, Number(e.target.value) || 0))}
            />
          </Field>
        </div>
        <fieldset className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <legend className="px-1 text-xs font-medium uppercase tracking-wider text-gray-500">End</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="recurring-end" checked={endMode === 'never'} onChange={() => setEndMode('never')} />
              Never
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="recurring-end" checked={endMode === 'after'} onChange={() => setEndMode('after')} />
              After
              <input
                type="number"
                min={1}
                className={`${INPUT} w-20`}
                value={maxOccurrences}
                disabled={endMode !== 'after'}
                onChange={(e) => setMaxOccurrences(e.target.value)}
                aria-label="Number of occurrences"
              />
              invoices
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="radio" name="recurring-end" checked={endMode === 'date'} onChange={() => setEndMode('date')} />
              On
              <input
                type="date"
                className={INPUT}
                value={endDate}
                disabled={endMode !== 'date'}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="Recurring schedule end date"
              />
            </label>
          </div>
        </fieldset>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Repeats {frequency === 'monthly' ? 'monthly' : frequencyLabel(frequency).toLowerCase()}
          {intervalCount > 1 ? ` every ${intervalCount} periods` : ''}. Invoices are created {createDaysInAdvance} day{createDaysInAdvance === 1 ? '' : 's'} in advance
          {endMode === 'after' && maxOccurrences ? ` and stop after ${maxOccurrences} invoices` : endMode === 'date' && endDate ? ` through ${endDate}` : ' with no end date'}.
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
          Automatically mark generated invoices as &ldquo;sent&rdquo; and email the payment link
        </label>
      </Section>

      <Section title="Line items">
        {lineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              className={`${INPUT} col-span-6`}
              placeholder="Description"
              value={li.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
            />
            <input
              type="number" min={1}
              className={`${INPUT} col-span-2`}
              value={li.qty}
              onChange={(e) => updateLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
            />
            <input
              type="number" min={0} step={0.01}
              className={`${INPUT} col-span-3`}
              value={(li.unit_cents / 100).toFixed(2)}
              onChange={(e) => updateLine(i, { unit_cents: Math.round(Number(e.target.value) * 100) || 0 })}
            />
            <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-gray-400 hover:text-red-600 text-lg leading-none">×</button>
          </div>
        ))}
        <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-700">+ Add line item</button>
        <div className="flex items-center gap-3 pt-2">
          <Field label="Tax ($)" className="w-32">
            <input
              type="number" min={0} step={0.01}
              className={INPUT}
              value={(taxCents / 100).toFixed(2)}
              onChange={(e) => setTaxCents(Math.round(Number(e.target.value) * 100) || 0)}
            />
          </Field>
          <div className="ml-auto text-sm text-gray-700">Total per invoice: <span className="font-semibold text-gray-900">{formatCents(total)}</span></div>
        </div>
      </Section>

      <Section title="Bill to">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name (optional override)">
            <input className={INPUT} value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Defaults to partner name" />
          </Field>
          <Field label="Email (optional override)">
            <input className={INPUT} value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} placeholder="Defaults to partner contact email" />
          </Field>
        </div>
        <Field label="Memo (optional)">
          <textarea className={INPUT} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
      </Section>

      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={handleSubmit} submitLabel={isEdit ? 'Save changes' : 'Create schedule'} />
    </DrawerShell>
  );
}
