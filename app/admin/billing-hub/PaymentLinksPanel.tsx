'use client';

// Billing > Payment links: create and manage invoice payment links. Uses the
// existing payment link manager; the data comes from the same queries the Get
// Paid page used.

import { useEffect, useState } from 'react';
import { PaymentLinksClient } from '@/app/admin/getpaid/_components/PaymentLinksClient';
import { A } from '@/components/anchor/ui';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';

export default function PaymentLinksPanel() {
  const [data, setData] = useState<{ invoices: InvoiceWithAdvertiser[]; advertisers: AdvertiserOption[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/admin/billing/payment-links-data', { cache: 'no-store', credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'failed'); setData(j); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Could not load payment links.'));
  }, []);
  if (err) return <div className={A.error}>{err}</div>;
  if (!data) return <p className="text-sm text-[color:var(--ds-body)]">Loading payment links…</p>;
  return <PaymentLinksClient initialInvoices={data.invoices} advertisers={data.advertisers} embedded />;
}
