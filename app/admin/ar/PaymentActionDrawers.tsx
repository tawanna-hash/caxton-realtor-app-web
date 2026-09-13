'use client';

import { useMemo, useState } from 'react';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { DrawerFooter, DrawerShell, Field, Section } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type CommonProps = {
  invoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
};

export function PaymentLinkDrawer({ invoices, onClose, onSaved, onError }: CommonProps) {
  const eligible = invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status) && invoice.total_cents > 0);
  const [invoiceId, setInvoiceId] = useState(eligible[0]?.id ?? '');
  const [linkType, setLinkType] = useState<'one-time' | 'multi-use'>('one-time');
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');

  const submit = async () => {
    if (!invoiceId) { onError('Select an unpaid invoice.'); return; }
    if (linkType === 'multi-use') {
      onError('Multi-use links require a reusable product checkout. Select a one-time invoice link for now.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email: sendEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not create payment link.');
      setCreatedUrl(data.checkout_url ?? data.portal_pay_url ?? '');
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create payment link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell title="Create a payment link" subtitle="Choose how you want to get paid" onClose={onClose}>
      <Section title="Payment link type">
        <label className={`block cursor-pointer rounded-lg border p-4 ${linkType === 'one-time' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <input type="radio" className="mr-2" checked={linkType === 'one-time'} onChange={() => setLinkType('one-time')} />
          <span className="font-medium text-gray-900">One-time payment link</span>
          <p className="ml-6 mt-1 text-xs text-gray-500">Works once with one client and expires after payment.</p>
        </label>
        <label className={`block cursor-pointer rounded-lg border p-4 ${linkType === 'multi-use' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
          <input type="radio" className="mr-2" checked={linkType === 'multi-use'} onChange={() => setLinkType('multi-use')} />
          <span className="font-medium text-gray-900">Multi-use payment link</span>
          <p className="ml-6 mt-1 text-xs text-gray-500">Reusable links will be enabled with product-based checkout.</p>
        </label>
      </Section>
      <Section title="Invoice">
        <Field label="Unpaid invoice">
          <select className={INPUT} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
            <option value="">Select an invoice</option>
            {eligible.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.number ?? 'Draft'} · {invoice.advertiser_name ?? invoice.bill_to_name ?? 'Customer'} · {formatCents(invoice.total_cents)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} />
          Email the secure payment link to the customer
        </label>
        {createdUrl && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <div className="text-xs font-medium text-emerald-800">Payment link created</div>
            <a href={createdUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm text-blue-700 underline">{createdUrl}</a>
          </div>
        )}
      </Section>
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Create link" />
    </DrawerShell>
  );
}

export function SalesReceiptDrawer({ advertisers, onClose, onSaved, onError }: CommonProps) {
  const [advertiserId, setAdvertiserId] = useState<number | null>(null);
  const [receiptDate, setReceiptDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState('');
  const [memo, setMemo] = useState('PLEASE MAKE CHECKS PAYABLE TO: CAXTON PUBLICATIONS INC');
  const [saving, setSaving] = useState(false);
  const amountCents = Math.round((Number(rate) || 0) * 100) * quantity;

  const submit = async () => {
    if (!advertiserId) { onError('Select a client.'); return; }
    if (!description.trim() || amountCents <= 0) { onError('Add a product or service and rate.'); return; }
    setSaving(true);
    try {
      const createResponse = await fetch('/api/admin/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advertiser_id: advertiserId,
          status: 'sent',
          amount_cents: amountCents,
          due_date: receiptDate,
          memo: `Sales receipt · ${paymentMethod}\n${memo}`.trim(),
          line_items: [{ description: description.trim(), qty: quantity, unit_cents: Math.round((Number(rate) || 0) * 100) }],
        }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !created.invoice?.id) throw new Error(created.error ?? 'Could not create sales receipt.');
      const paidAt = new Date(`${receiptDate}T12:00:00.000Z`).toISOString();
      const paidResponse = await fetch(`/api/admin/invoices/${created.invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paid', paid_at: paidAt }),
      });
      if (!paidResponse.ok) throw new Error('Receipt was created but could not be marked paid.');
      await onSaved();
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not create sales receipt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell title="New sales receipt" subtitle={`Amount received: ${formatCents(amountCents)}`} onClose={onClose} wide>
      <Section title="Client and payment">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <select className={INPUT} value={advertiserId ?? ''} onChange={(event) => setAdvertiserId(event.target.value ? Number(event.target.value) : null)}>
              <option value="">Choose a client</option>
              {advertisers.map((advertiser) => <option key={advertiser.id} value={advertiser.id}>{advertiser.name}</option>)}
            </select>
          </Field>
          <Field label="Sales receipt date"><input type="date" className={INPUT} value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></Field>
          <Field label="Payment method">
            <select className={INPUT} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {['Check', 'Cash', 'ACH / bank transfer', 'Credit card', 'Other'].map((method) => <option key={method}>{method}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Product or service">
        <div className="grid grid-cols-12 gap-2">
          <Field label="Description" className="col-span-7"><input className={INPUT} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
          <Field label="Qty" className="col-span-2"><input type="number" min={1} className={INPUT} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></Field>
          <Field label="Rate" className="col-span-3"><input type="number" min={0} step="0.01" className={INPUT} value={rate} onChange={(event) => setRate(event.target.value)} /></Field>
        </div>
        <div className="text-right text-sm font-semibold text-gray-900">Total: {formatCents(amountCents)}</div>
      </Section>
      <Section title="Message displayed on sales receipt">
        <textarea className={`${INPUT} resize-y`} rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
      </Section>
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Record and close" />
    </DrawerShell>
  );
}

export function RecordPaymentDrawer({ invoices, advertisers, onClose, onSaved, onError }: CommonProps) {
  const [advertiserId, setAdvertiserId] = useState<number | null>(null);
  const eligible = useMemo(
    () => invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status) && (!advertiserId || invoice.advertiser_id === advertiserId)),
    [advertiserId, invoices],
  );
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

  const submit = async () => {
    if (!selectedInvoice) { onError('Select an invoice to receive payment against.'); return; }
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/invoices/${selectedInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paid_at: new Date(`${paymentDate}T12:00:00.000Z`).toISOString(),
          memo: [selectedInvoice.memo, `Payment received · ${paymentMethod}${reference ? ` · Ref ${reference}` : ''}`, memo].filter(Boolean).join('\n'),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'Could not record payment.');
      await onSaved();
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell title="Receive payment" subtitle={`Amount received: ${formatCents(selectedInvoice?.total_cents ?? 0)}`} onClose={onClose} wide>
      <Section title="Client and invoice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <select className={INPUT} value={advertiserId ?? ''} onChange={(event) => { setAdvertiserId(event.target.value ? Number(event.target.value) : null); setInvoiceId(''); }}>
              <option value="">Choose a client</option>
              {advertisers.map((advertiser) => <option key={advertiser.id} value={advertiser.id}>{advertiser.name}</option>)}
            </select>
          </Field>
          <Field label="Find by invoice number">
            <select className={INPUT} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}>
              <option value="">Select an unpaid invoice</option>
              {eligible.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.number ?? 'Draft'} · {formatCents(invoice.total_cents)}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Record or charge">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment date"><input type="date" className={INPUT} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></Field>
          <Field label="Payment method">
            <select className={INPUT} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
              {['Check', 'Cash', 'ACH / bank transfer', 'Credit card', 'Other'].map((method) => <option key={method}>{method}</option>)}
            </select>
          </Field>
          <Field label="Reference no."><input className={INPUT} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label="Amount received"><input className={INPUT} readOnly value={selectedInvoice ? (selectedInvoice.total_cents / 100).toFixed(2) : '0.00'} /></Field>
        </div>
      </Section>
      <Section title="Memo">
        <textarea className={`${INPUT} resize-y`} rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
      </Section>
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Record payment" />
    </DrawerShell>
  );
}
