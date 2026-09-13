'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { InvoiceLineItem, InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, PAYMENT_METHODS } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { DrawerFooter, DrawerShell, Field, Section } from '@/app/admin/billing/_components/DrawerShell';
import { INPUT } from '@/app/admin/billing/_components/constants';
import { ProductServiceSearch } from '@/app/admin/billing/_components/ProductServiceSearch';
import { toISODateString } from '@/app/admin/billing/_components/helpers';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type CommonProps = {
  invoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  initialInvoiceId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
};

type WorkflowTab = 'edit' | 'email' | 'pdf';

function WorkflowTabs({ active, onChange }: { active: WorkflowTab; onChange: (tab: WorkflowTab) => void }) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {([
        ['edit', 'Edit'],
        ['email', 'Email view'],
        ['pdf', 'PDF view'],
      ] as const).map(([tab, label]) => (
        <button
          type="button"
          key={tab}
          onClick={() => onChange(tab)}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${active === tab ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmailPreview({
  heading, customer, amount, message, actionLabel,
}: {
  heading: string;
  customer: string;
  amount: number;
  message: string;
  actionLabel: string;
}) {
  return (
    <div className="mx-auto max-w-md overflow-hidden rounded-lg border border-gray-200 bg-white text-center shadow-sm">
      <div className="p-6">
        <Image src="/brand/caxton-logo.jpg" alt="Caxton Publications" width={150} height={170} className="mx-auto h-28 w-auto object-contain" />
      </div>
      <div className="bg-blue-50 px-6 py-5">
        <h3 className="text-lg font-semibold text-gray-900">{heading}</h3>
        <p className="mt-1 text-sm text-gray-600">{customer}</p>
        <div className="mt-4 text-xs uppercase tracking-wider text-gray-500">Amount</div>
        <div className="text-2xl font-semibold text-gray-900">{formatCents(amount)}</div>
      </div>
      <div className="space-y-4 px-6 py-5">
        <button type="button" className="rounded-full bg-orange-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">{actionLabel}</button>
        <p className="border-t border-gray-200 pt-4 text-sm text-gray-600">{message}</p>
      </div>
      <div className="bg-blue-50 px-6 py-5 text-xs leading-5 text-gray-600">
        <strong>Caxton Publications Inc.</strong><br />Austin, Texas
      </div>
    </div>
  );
}

function PdfPreview({
  title, number, customer, date, amount, lineItems, note,
}: {
  title: string;
  number: string;
  customer: string;
  date: string;
  amount: number;
  lineItems: InvoiceLineItem[];
  note: string;
}) {
  return (
    <div className="mx-auto max-w-3xl rounded-sm border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex items-start justify-between border-b border-gray-200 pb-6">
        <Image src="/brand/caxton-logo.jpg" alt="Caxton Publications" width={130} height={145} className="h-24 w-auto object-contain" />
        <div className="text-right">
          <h3 className="text-2xl font-semibold tracking-wide text-gray-900">{title}</h3>
          <p className="mt-2 text-sm text-gray-600">{number}</p>
          <p className="text-sm text-gray-600">{date}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8 py-6 text-sm">
        <div><div className="text-xs uppercase tracking-wider text-gray-500">From</div><strong>Caxton Publications Inc.</strong></div>
        <div><div className="text-xs uppercase tracking-wider text-gray-500">Customer</div><strong>{customer}</strong></div>
      </div>
      <div className="overflow-hidden rounded border border-gray-200">
        <div className="grid grid-cols-12 bg-gray-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          <span className="col-span-7">Product or service</span><span className="col-span-2 text-right">Qty</span><span className="col-span-3 text-right">Amount</span>
        </div>
        {(lineItems.length ? lineItems : [{ description: 'Payment', qty: 1, unit_cents: amount }]).map((item, index) => (
          <div key={`${item.description}-${index}`} className="grid grid-cols-12 border-t border-gray-200 px-4 py-3 text-sm text-gray-800">
            <span className="col-span-7">{item.description}</span><span className="col-span-2 text-right">{item.qty}</span><span className="col-span-3 text-right">{formatCents(item.qty * item.unit_cents)}</span>
          </div>
        ))}
      </div>
      <div className="ml-auto mt-6 w-64 border-t border-gray-900 pt-3 text-right text-lg font-semibold text-gray-900">Total {formatCents(amount)}</div>
      <p className="mt-8 border-t border-gray-200 pt-4 text-sm text-gray-600">{note}</p>
    </div>
  );
}

export function PaymentLinkDrawer({ invoices, initialInvoiceId, onClose, onSaved, onError }: CommonProps) {
  const eligible = invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status) && invoice.total_cents > 0);
  const [invoiceId, setInvoiceId] = useState(
    initialInvoiceId && eligible.some((invoice) => invoice.id === initialInvoiceId)
      ? initialInvoiceId
      : eligible[0]?.id ?? '',
  );
  const [linkType, setLinkType] = useState<'one-time' | 'multi-use'>('one-time');
  const [sendEmail, setSendEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  const [activeTab, setActiveTab] = useState<WorkflowTab>('edit');
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

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
    <DrawerShell title="Create a payment link" subtitle="Choose how you want to get paid" onClose={onClose} wide>
      <WorkflowTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'edit' && (
        <>
      <Section title="Payment link type">
        <label className={`block cursor-pointer rounded-lg border p-4 ${linkType === 'one-time' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
          <input type="radio" className="mr-2" checked={linkType === 'one-time'} onChange={() => setLinkType('one-time')} />
          <span className="font-medium text-gray-900">One-time payment link</span>
          <p className="ml-6 mt-1 text-xs text-gray-500">Works once with one client and expires after payment.</p>
        </label>
        <label className={`block cursor-pointer rounded-lg border p-4 ${linkType === 'multi-use' ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
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
            <a href={createdUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm text-orange-700 underline">{createdUrl}</a>
          </div>
        )}
      </Section>
        </>
      )}
      {activeTab === 'email' && (
        <EmailPreview
          heading="Your payment link is ready"
          customer={selectedInvoice?.bill_to_name ?? selectedInvoice?.advertiser_name ?? 'Select a customer'}
          amount={selectedInvoice?.total_cents ?? 0}
          message={selectedInvoice ? `Use this secure link to pay ${selectedInvoice.number ?? 'your invoice'}.` : 'Select an invoice to preview the payment email.'}
          actionLabel="View and pay"
        />
      )}
      {activeTab === 'pdf' && (
        <PdfPreview
          title="PAYMENT REQUEST"
          number={selectedInvoice?.number ?? 'Select an invoice'}
          customer={selectedInvoice?.bill_to_name ?? selectedInvoice?.advertiser_name ?? 'Customer'}
          date={toISODateString(selectedInvoice?.issued_at) || todayIso()}
          amount={selectedInvoice?.total_cents ?? 0}
          lineItems={selectedInvoice?.line_items ?? []}
          note="Use the secure payment link in your email to complete payment."
        />
      )}
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Create link" tone="orange" />
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
  const [activeTab, setActiveTab] = useState<WorkflowTab>('edit');
  const amountCents = Math.round((Number(rate) || 0) * 100) * quantity;
  const selectedAdvertiser = advertisers.find((advertiser) => advertiser.id === advertiserId);
  const receiptLineItems = description.trim()
    ? [{ description: description.trim(), qty: quantity, unit_cents: Math.round((Number(rate) || 0) * 100) }]
    : [];

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
          document_type: 'sales_receipt',
          status: 'sent',
          amount_cents: amountCents,
          due_date: receiptDate,
          memo: `Sales receipt · ${paymentMethod}\n${memo}`.trim(),
          line_items: [{ description: description.trim(), qty: quantity, unit_cents: Math.round((Number(rate) || 0) * 100) }],
        }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok || !created.invoice?.id) throw new Error(created.error ?? 'Could not create sales receipt.');
      const paidResponse = await fetch('/api/admin/invoice-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: created.invoice.id,
          amount_cents: amountCents,
          payment_date: receiptDate,
          payment_method: paymentMethod,
          memo: `Payment recorded with sales receipt ${created.invoice.number ?? ''}`.trim(),
          source: 'sales_receipt',
          external_id: created.invoice.id,
        }),
      });
      const paid = await paidResponse.json().catch(() => ({}));
      if (!paidResponse.ok) {
        throw new Error(paid.error ?? 'Receipt was created but its payment could not be recorded.');
      }
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
      <WorkflowTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'edit' && (
        <>
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
              {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </Field>
        </div>
      </Section>
      <Section title="Product or service">
        <div className="grid grid-cols-12 gap-2">
          <Field label="Description" className="col-span-7">
            <ProductServiceSearch
              value={description}
              onChange={setDescription}
              onSelect={(item) => {
                setDescription(item.sales_description || item.name);
                setRate(((item.price_cents ?? 0) / 100).toFixed(2));
              }}
            />
          </Field>
          <Field label="Qty" className="col-span-2"><input type="number" min={1} className={INPUT} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></Field>
          <Field label="Rate" className="col-span-3"><input type="number" min={0} step="0.01" className={INPUT} value={rate} onChange={(event) => setRate(event.target.value)} /></Field>
        </div>
        <div className="text-right text-sm font-semibold text-gray-900">Total: {formatCents(amountCents)}</div>
      </Section>
      <Section title="Message displayed on sales receipt">
        <textarea className={`${INPUT} resize-y`} rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
      </Section>
        </>
      )}
      {activeTab === 'email' && (
        <EmailPreview
          heading="Your sales receipt"
          customer={selectedAdvertiser?.name ?? 'Select a customer'}
          amount={amountCents}
          message={memo || 'Thank you for your payment.'}
          actionLabel="View receipt"
        />
      )}
      {activeTab === 'pdf' && (
        <PdfPreview
          title="SALES RECEIPT"
          number={`SR-${new Date().getFullYear()}-####`}
          customer={selectedAdvertiser?.name ?? 'Customer'}
          date={receiptDate}
          amount={amountCents}
          lineItems={receiptLineItems}
          note={memo || 'Thank you for your payment.'}
        />
      )}
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Record and close" tone="orange" />
    </DrawerShell>
  );
}

export function RecordPaymentDrawer({ invoices, advertisers, initialInvoiceId, onClose, onSaved, onError }: CommonProps) {
  const initialInvoice = invoices.find((invoice) => invoice.id === initialInvoiceId);
  const [advertiserId, setAdvertiserId] = useState<number | null>(initialInvoice?.advertiser_id ?? null);
  const eligible = useMemo(
    () => invoices.filter((invoice) => !['paid', 'void'].includes(invoice.status) && (!advertiserId || invoice.advertiser_id === advertiserId)),
    [advertiserId, invoices],
  );
  const [invoiceId, setInvoiceId] = useState(initialInvoice?.id ?? '');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [paymentMethod, setPaymentMethod] = useState('Check');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [amount, setAmount] = useState(
    initialInvoice ? ((initialInvoice.balance_cents ?? initialInvoice.total_cents) / 100).toFixed(2) : '',
  );
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkflowTab>('edit');
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);

  const submit = async () => {
    if (!selectedInvoice) { onError('Select an invoice to receive payment against.'); return; }
    setSaving(true);
    try {
      const amountCents = Math.round(Number(amount) * 100);
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        throw new Error('Enter a valid payment amount.');
      }
      const response = await fetch('/api/admin/invoice-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: selectedInvoice.id,
          amount_cents: amountCents,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference,
          memo,
          source: 'manual',
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
      <WorkflowTabs active={activeTab} onChange={setActiveTab} />
      {activeTab === 'edit' && (
        <>
      <Section title="Client and invoice">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Client">
            <select className={INPUT} value={advertiserId ?? ''} onChange={(event) => { setAdvertiserId(event.target.value ? Number(event.target.value) : null); setInvoiceId(''); }}>
              <option value="">Choose a client</option>
              {advertisers.map((advertiser) => <option key={advertiser.id} value={advertiser.id}>{advertiser.name}</option>)}
            </select>
          </Field>
          <Field label="Find by invoice number">
            <select className={INPUT} value={invoiceId} onChange={(event) => {
              const nextId = event.target.value;
              setInvoiceId(nextId);
              const nextInvoice = invoices.find((invoice) => invoice.id === nextId);
              setAmount(nextInvoice ? ((nextInvoice.balance_cents ?? nextInvoice.total_cents) / 100).toFixed(2) : '');
            }}>
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
              {PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}
            </select>
          </Field>
          <Field label="Reference no."><input className={INPUT} value={reference} onChange={(event) => setReference(event.target.value)} /></Field>
          <Field label="Amount received"><input type="number" min="0.01" step="0.01" className={INPUT} value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
        </div>
      </Section>
      <Section title="Memo">
        <textarea className={`${INPUT} resize-y`} rows={3} value={memo} onChange={(event) => setMemo(event.target.value)} />
      </Section>
        </>
      )}
      {activeTab === 'email' && (
        <EmailPreview
          heading="Payment received"
          customer={selectedInvoice?.bill_to_name ?? selectedInvoice?.advertiser_name ?? 'Select a customer'}
          amount={Math.round(Number(amount || 0) * 100)}
          message={selectedInvoice ? `Payment for ${selectedInvoice.number ?? 'your invoice'} was recorded on ${paymentDate}.` : 'Select an invoice to preview the receipt email.'}
          actionLabel="View payment"
        />
      )}
      {activeTab === 'pdf' && (
        <PdfPreview
          title="PAYMENT RECEIPT"
          number={reference || selectedInvoice?.number || 'Select an invoice'}
          customer={selectedInvoice?.bill_to_name ?? selectedInvoice?.advertiser_name ?? 'Customer'}
          date={paymentDate}
          amount={Math.round(Number(amount || 0) * 100)}
          lineItems={selectedInvoice ? [{ description: `Payment for ${selectedInvoice.number ?? 'invoice'}`, qty: 1, unit_cents: Math.round(Number(amount || 0) * 100) }] : []}
          note={memo || `Payment method: ${paymentMethod}`}
        />
      )}
      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel="Record payment" tone="orange" />
    </DrawerShell>
  );
}
