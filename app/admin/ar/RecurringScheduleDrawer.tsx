'use client';

// app/admin/ar/RecurringScheduleDrawer.tsx
//
// Create/edit drawer for a recurring invoice schedule. Works for both
// agreement-linked (agreement_id set, locked) and standalone schedules
// (advertiser + agreement picked freely).

import { useMemo, useState } from 'react';
import Image from 'next/image';
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
import { ProductServiceSearch } from '@/app/admin/billing/_components/ProductServiceSearch';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';

const FREQ_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Yearly' },
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
  const [dayOfMonth, setDayOfMonth] = useState<number>(existing?.day_of_month ?? 18);
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
  const [templateMode, setTemplateMode] = useState<'scheduled' | 'reminder' | 'unscheduled'>(existing?.template_mode ?? 'scheduled');
  const [includeUnbilledCharges, setIncludeUnbilledCharges] = useState(existing?.include_unbilled_charges ?? false);
  const [printLater, setPrintLater] = useState(existing?.print_later ?? false);
  const [emailReminders, setEmailReminders] = useState(existing?.email_reminders ?? true);
  const [paymentInstructions, setPaymentInstructions] = useState(existing?.payment_instructions ?? '');
  const [noteToClient, setNoteToClient] = useState(existing?.note_to_client ?? 'PLEASE MAKE CHECKS PAYABLE TO: CAXTON PUBLICATIONS INC');
  const [statementMemo, setStatementMemo] = useState(existing?.statement_memo ?? '');
  const [activeTab, setActiveTab] = useState<'edit' | 'email' | 'payor' | 'pdf'>('edit');
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
      day_of_month: frequency === 'monthly' || frequency === 'quarterly' || frequency === 'annually' ? dayOfMonth : null,
      line_items: lineItems.filter((li) => li.description.trim() || li.unit_cents),
      tax_cents: taxCents,
      due_days: dueDays,
      create_days_in_advance: createDaysInAdvance,
      auto_send: autoSend,
      template_mode: templateMode,
      include_unbilled_charges: includeUnbilledCharges,
      print_later: printLater,
      email_reminders: emailReminders,
      payment_instructions: paymentInstructions || null,
      note_to_client: noteToClient || null,
      statement_memo: statementMemo || null,
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
      wide
    >
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['edit', 'Edit'],
          ['email', 'Email view'],
          ['payor', 'Payor view'],
          ['pdf', 'PDF view'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveTab(value)}
            className={`border-b-2 px-4 py-2 text-sm ${activeTab === value ? 'border-orange-600 font-medium text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'edit' && (
        <>
      <Section title="Recurring invoice template">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Template name">
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly banner ad" />
          </Field>
          <Field label="Type">
            <select className={INPUT} value={templateMode} onChange={(e) => setTemplateMode(e.target.value as typeof templateMode)}>
              <option value="scheduled">Scheduled</option>
              <option value="reminder">Reminder</option>
              <option value="unscheduled">Unscheduled</option>
            </select>
          </Field>
        </div>
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Frequency">
            <select className={INPUT} value={frequency} onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}>
              {FREQ_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="Every N periods">
            <input type="number" min={1} className={INPUT} value={intervalCount} onChange={(e) => setIntervalCount(Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          {(frequency === 'monthly' || frequency === 'quarterly' || frequency === 'annually') && (
            <Field label="Day">
              <select className={INPUT} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day}{day === 1 || day === 21 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'}</option>
                ))}
              </select>
            </Field>
          )}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="End">
            <select className={INPUT} value={endMode} onChange={(e) => setEndMode(e.target.value as 'never' | 'after' | 'date')}>
              <option value="never">Never</option>
              <option value="date">By</option>
              <option value="after">After</option>
            </select>
          </Field>
          {endMode === 'after' && (
            <Field label="Number of occurrences">
              <input
                type="number"
                min={1}
                className={INPUT}
                value={maxOccurrences}
                onChange={(e) => setMaxOccurrences(e.target.value)}
              />
            </Field>
          )}
          {endMode === 'date' && (
            <Field label="End date">
              <input
                type="date"
                className={INPUT}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </Field>
          )}
        </div>
        <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
          Repeats {frequency === 'monthly' ? 'monthly' : frequencyLabel(frequency).toLowerCase()}
          {intervalCount > 1 ? ` every ${intervalCount} periods` : ''}. Invoices are created {createDaysInAdvance} day{createDaysInAdvance === 1 ? '' : 's'} in advance
          {endMode === 'after' && maxOccurrences ? ` and stop after ${maxOccurrences} invoices` : endMode === 'date' && endDate ? ` through ${endDate}` : ' with no end date'}.
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
          Automatically mark generated invoices as &ldquo;sent&rdquo; and email the payment link
        </label>
        <div className="grid gap-2 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeUnbilledCharges} onChange={(e) => setIncludeUnbilledCharges(e.target.checked)} />
            Include unbilled charges
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={printLater} onChange={(e) => setPrintLater(e.target.checked)} />
            Mark generated invoices as print later
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={emailReminders} onChange={(e) => setEmailReminders(e.target.checked)} />
            Automatic invoice reminders
          </label>
        </div>
      </Section>

      <Section title="Line items">
        {lineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <ProductServiceSearch
              className="col-span-6"
              value={li.description}
              onChange={(value) => updateLine(i, { description: value })}
              onSelect={(item) => updateLine(i, {
                description: item.sales_description || item.name,
                unit_cents: item.price_cents ?? 0,
              })}
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
        <button type="button" onClick={addLine} className="text-sm text-orange-600 hover:text-orange-700">+ Add line item</button>
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
        <Field label="Payment instructions">
          <textarea className={INPUT} rows={2} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="Enter your bank or preferred payment service provider details here." />
        </Field>
        <Field label="Note to client">
          <textarea className={INPUT} rows={2} value={noteToClient} onChange={(e) => setNoteToClient(e.target.value)} />
        </Field>
        <Field label="Memo on statement">
          <textarea className={INPUT} rows={2} value={statementMemo} onChange={(e) => setStatementMemo(e.target.value)} placeholder="This memo appears on customer statements." />
        </Field>
      </Section>
        </>
      )}

      {activeTab === 'email' && (
        <div className="mx-auto max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white text-center shadow-sm">
          <div className="p-6">
            <Image src="/brand/caxton-logo.jpg" alt="Caxton Publications" width={150} height={170} className="mx-auto h-28 w-auto object-contain" />
          </div>
          <div className="bg-blue-50 px-6 py-5">
            <h3 className="text-lg font-semibold text-gray-900">Your invoice is ready!</h3>
            <div className="mt-4 text-xs uppercase tracking-wider text-gray-500">Balance due</div>
            <div className="text-2xl font-semibold text-gray-900">{formatCents(total)}</div>
          </div>
          <div className="space-y-4 px-6 py-5">
            <button type="button" className="rounded-full bg-orange-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">View and pay</button>
            {paymentInstructions && <p className="text-sm text-gray-600">{paymentInstructions}</p>}
            <p className="border-t border-gray-200 pt-4 text-sm text-gray-600">{noteToClient || 'Your invoice is attached and ready for review.'}</p>
          </div>
          <div className="bg-blue-50 px-6 py-5 text-xs leading-5 text-gray-600">
            <strong>Caxton Publications Inc.</strong><br />
            PO Box 81366<br />Austin, TX 78708-1366<br />
            tawanna@myrealtyline.com<br />www.realtynewsnow.app
          </div>
        </div>
      )}

      {activeTab === 'payor' && (
        <div className="mx-auto grid max-w-3xl gap-4 rounded-lg border border-gray-200 bg-gray-100 p-5 shadow-sm sm:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-lg bg-white p-6">
            <div className="text-xs font-medium text-gray-500">Payment amount</div>
            <div className="mt-1 text-3xl font-semibold text-gray-900">{formatCents(total)}</div>
            <Field label="Email">
              <input className={INPUT} value={billToEmail} readOnly placeholder="payer@example.com" />
            </Field>
            <div className="mt-5 text-xs font-medium text-gray-500">Payment method</div>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {['Debit', 'Credit', 'Bank', 'Venmo', 'PayPal'].map((method) => (
                <div key={method} className="rounded border border-gray-200 bg-gray-50 px-2 py-3 text-center text-xs text-gray-700">{method}</div>
              ))}
            </div>
            <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-500">
              Secure Stripe checkout will collect the selected payment method.
            </div>
          </div>
          <aside className="space-y-4">
            <div className="rounded-lg bg-white p-4">
              <Image src="/brand/caxton-logo.jpg" alt="Caxton Publications" width={90} height={100} className="h-16 w-auto object-contain" />
              <div className="mt-3 font-semibold text-gray-900">Caxton Publications Inc.</div>
              <div className="mt-3 flex justify-between text-sm"><span>Invoice</span><span>{name || '[INVOICE NO.]'}</span></div>
              <div className="flex justify-between text-sm"><span>Total</span><strong>{formatCents(total)}</strong></div>
            </div>
            <div className="rounded-lg bg-white p-4 text-xs text-gray-600">
              <strong>Business details</strong><br />Email: tawanna@myrealtyline.com
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'pdf' && (
        <div className="mx-auto max-w-2xl bg-white px-8 py-10 text-[10px] text-gray-800 shadow-sm ring-1 ring-gray-200">
          <header className="flex items-start justify-between border-b border-gray-300 pb-4">
            <Image src="/brand/caxton-logo.jpg" alt="Caxton Publications" width={130} height={145} className="h-24 w-auto object-contain" />
            <div className="text-right">
              <div className="text-2xl tracking-wide">INVOICE</div>
              <strong>Caxton Publications, Inc.</strong><br />PO Box 81366<br />Austin, Texas 78708-1366
            </div>
          </header>
          <div className="grid grid-cols-2 gap-8 py-5">
            <div><span className="text-gray-500">BILL TO</span><br /><strong>{billToName || 'Customer'}</strong><br />{billToEmail}</div>
            <div className="text-right">Invoice: Recurring template<br />Terms: Net {dueDays}<br /><strong>Amount due: {formatCents(total)}</strong></div>
          </div>
          <div className="grid grid-cols-[1fr_60px_80px_90px] bg-gray-900 px-3 py-2 font-semibold text-white">
            <div>Services</div><div>Qty</div><div className="text-right">Rate</div><div className="text-right">Amount</div>
          </div>
          {lineItems.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_60px_80px_90px] border-b border-gray-200 px-3 py-3">
              <div>{item.description || 'Service'}</div><div>{item.qty}</div><div className="text-right">{formatCents(item.unit_cents)}</div><div className="text-right">{formatCents(item.qty * item.unit_cents)}</div>
            </div>
          ))}
          <div className="ml-auto mt-4 w-56 text-right text-sm font-semibold">Amount Due (USD): {formatCents(total)}</div>
          {(noteToClient || statementMemo) && <div className="mt-6 border-t border-gray-200 pt-4 whitespace-pre-line">{noteToClient}{statementMemo ? `\n\n${statementMemo}` : ''}</div>}
          <div className="mt-10 text-center text-gray-500">We appreciate your business.</div>
        </div>
      )}

      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={handleSubmit} submitLabel={isEdit ? 'Save changes' : 'Create schedule'} tone="orange" />
    </DrawerShell>
  );
}
