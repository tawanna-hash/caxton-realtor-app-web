'use client';

import { useState } from 'react';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { PaymentLinkDrawer } from '@/app/admin/ar/PaymentActionDrawers';
import PageTitle from '@/components/ui/PageTitle';

export function PaymentLinksClient({ initialInvoices, advertisers }: { initialInvoices: InvoiceWithAdvertiser[]; advertisers: AdvertiserOption[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const links = invoices.filter((invoice) => invoice.stripe_payment_link_url);
  const reload = async () => {
    const response = await fetch('/api/admin/invoices', { cache: 'no-store' });
    if (response.ok) setInvoices((await response.json()).invoices ?? []);
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8">
      <div><div className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-gray-500">Admin · Get Paid</div><PageTitle size="md">Payment links</PageTitle></div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="rounded-lg border border-gray-200 bg-gradient-to-br from-emerald-50 to-white p-7">
          <h2 className="max-w-md text-3xl font-semibold text-gray-900">Get paid easily anywhere, anytime with payment links.</h2>
          <p className="mt-3 max-w-xl text-sm text-gray-600">Share a secure payment link with clients by email or text and record payment against the selected invoice.</p>
          <ol className="mt-6 space-y-4">
            <li className="flex gap-3"><span className="text-2xl text-emerald-700">1</span><div><strong>Create a unique link</strong><p className="text-sm text-gray-600">Choose an open invoice for one client.</p></div></li>
            <li className="flex gap-3"><span className="text-2xl text-emerald-700">2</span><div><strong>Share it with your client</strong><p className="text-sm text-gray-600">Send the payment link by email or copy it.</p></div></li>
            <li className="flex gap-3"><span className="text-2xl text-emerald-700">3</span><div><strong>Get paid</strong><p className="text-sm text-gray-600">Stripe records the completed payment.</p></div></li>
          </ol>
          <button type="button" onClick={() => setCreating(true)} className="mt-7 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">Create a link</button>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="font-semibold text-gray-900">How do you want to get paid?</h3>
          <p className="mt-1 text-sm text-gray-500">Select the payment link that meets your needs.</p>
          <div className="mt-5 space-y-3"><div className="rounded-md border border-emerald-300 bg-emerald-50 p-4"><strong className="text-sm">One-time payment link</strong><p className="mt-1 text-xs text-gray-600">Works once with one client and expires after payment.</p></div><div className="rounded-md border border-gray-200 p-4"><strong className="text-sm">Multi-use payment link</strong><p className="mt-1 text-xs text-gray-600">Reusable product checkout will be available here.</p></div></div>
        </div>
      </div>
      <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Created payment links</div>
        {links.map((invoice) => <div key={invoice.id} className="grid gap-3 border-b border-gray-100 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_auto_auto]"><span>{invoice.number}</span><span>{invoice.advertiser_name ?? invoice.bill_to_name}</span><span>{formatCents(invoice.total_cents)}</span><a className="text-orange-700 hover:underline" href={invoice.stripe_payment_link_url ?? '#'} target="_blank" rel="noreferrer">Open link</a></div>)}
        {links.length === 0 && <div className="p-8 text-center text-sm text-gray-500">No payment links have been created yet.</div>}
      </div>
      {creating && <PaymentLinkDrawer invoices={invoices} advertisers={advertisers} onClose={() => setCreating(false)} onSaved={reload} onError={setError} />}
    </div>
  );
}
