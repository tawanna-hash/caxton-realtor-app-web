'use client';

// app/admin/invoices/InvoicesClient.tsx
//
// Invoices workspace. Accepts seed query params from /admin/agreements
// (?create=1&advertiser_id=…&agreement_id=…&amount_cents=…) to open the
// create drawer pre-populated when arriving via "Generate invoice".

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';

import { Kpi } from '@/app/admin/billing/_components/Badges';
import { INV_STATUS } from '@/app/admin/billing/_components/constants';
import { InvoiceList } from '@/app/admin/billing/_components/InvoiceList';
import { InvoiceDrawer } from '@/app/admin/billing/_components/InvoiceDrawer';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';

import PageTitle from '@/components/ui/PageTitle';
type Props = {
  initialInvoices: InvoiceWithAdvertiser[];
  agreements: AgreementWithAdvertiser[];
  advertisers: AdvertiserOption[];
};

export default function InvoicesClient({
  initialInvoices,
  agreements,
  advertisers,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Derive any inbound seed from query params synchronously. The effect
  // below only fires the URL cleanup + drawer-open side effects — it does
  // not setState during render, which is why this derivation lives here
  // rather than inside useEffect.
  const seedFromUrl = useMemo(() => {
    if (searchParams.get('create') !== '1') return null;
    const advId = searchParams.get('advertiser_id');
    const agrId = searchParams.get('agreement_id') ?? '';
    const amt = searchParams.get('amount_cents');
    return {
      advertiser_id: advId ? Number(advId) : null,
      agreement_id: agrId,
      amount_cents: amt ? Number(amt) : null,
    };
  }, [searchParams]);

  const [invoices, setInvoices] = useState(initialInvoices);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createInv, setCreateInv] = useState<boolean>(() => seedFromUrl !== null);
  const [editInv, setEditInv] = useState<InvoiceWithAdvertiser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceSeed, setInvoiceSeed] = useState<{
    advertiser_id: number | null;
    agreement_id: string;
    amount_cents: number | null;
  } | null>(seedFromUrl);

  const reloadInvoices = useCallback(async () => {
    const res = await fetch('/api/admin/invoices', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) setInvoices((await res.json()).invoices ?? []);
  }, [router]);

  // After picking up the inbound seed, strip the query string so a browser
  // refresh doesn't re-open the drawer. Runs once per mount.
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (!cleanedRef.current && seedFromUrl) {
      cleanedRef.current = true;
      router.replace('/admin/invoices');
    }
  }, [seedFromUrl, router]);

  const filteredInv = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter && !(statusFilter === 'overdue' && i.is_overdue)) return false;
      if (!q) return true;
      return [i.number, i.advertiser_name, i.bill_to_email, i.memo].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [invoices, query, statusFilter]);

  const kpis = useMemo(() => {
    const t = new Date();
    const startOfMonth = new Date(t.getFullYear(), t.getMonth(), 1).getTime();
    let mtd = 0, ar = 0, overdue = 0;
    let paid30 = 0;
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 30 * 86400000;
    for (const i of invoices) {
      if (i.status === 'paid' && i.paid_at) {
        const paidTs = new Date(i.paid_at).getTime();
        if (paidTs >= startOfMonth) mtd += i.total_cents ?? 0;
        if (paidTs > cutoff) paid30 += i.total_cents ?? 0;
      }
      if (i.status !== 'paid' && i.status !== 'void') {
        ar += i.total_cents ?? 0;
        if (i.is_overdue) overdue += i.total_cents ?? 0;
      }
    }
    return { mtd, ar, overdue, paid30 };
  }, [invoices]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin · Invoices</div>
          <PageTitle size="md">Invoices</PageTitle>
          <p className="text-sm text-gray-600 mt-1">Billable charges and payment status. Stripe charges land via the public Sign Wizard.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCreateInv(true)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">+ New invoice</button>
        </div>
      </div>

      {/* Money summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Revenue MTD" value={formatCents(kpis.mtd)} accent="emerald" />
        <Kpi label="AR outstanding" value={formatCents(kpis.ar)} accent="blue" />
        <Kpi
          label="Overdue"
          value={formatCents(kpis.overdue)}
          accent="rose"
          onClick={() => setStatusFilter('overdue')}
        />
        <Kpi label="Paid (30d)" value={formatCents(kpis.paid30)} accent="amber" />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-2 items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search invoice #, advertiser&hellip;"
          className="flex-1 min-w-[240px] px-3 py-2 rounded border border-gray-300 text-sm"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded border border-gray-300 text-sm">
          <option value="all">All statuses</option>
          {INV_STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <InvoiceList rows={filteredInv} onOpen={(r) => setEditInv(r)} />

      {/* Drawers */}
      {createInv && (
        <InvoiceDrawer
          advertisers={advertisers}
          agreements={agreements}
          seed={invoiceSeed ?? undefined}
          onClose={() => { setCreateInv(false); setInvoiceSeed(null); }}
          onSaved={async () => { setCreateInv(false); setInvoiceSeed(null); await reloadInvoices(); }}
          onError={setError}
        />
      )}
      {editInv && (
        <InvoiceDrawer
          existing={editInv}
          advertisers={advertisers}
          agreements={agreements}
          onClose={() => setEditInv(null)}
          onSaved={async () => { setEditInv(null); await reloadInvoices(); }}
          onError={setError}
        />
      )}
    </div>
  );
}
