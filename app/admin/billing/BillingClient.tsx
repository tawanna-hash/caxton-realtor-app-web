'use client';

// app/admin/billing/BillingClient.tsx
//
// Tabbed billing workspace. Agreements + Invoices + Renewals. Each tab is a
// filterable list with a "+" affordance opening the matching create drawer.
//
// This file is intentionally lean — the heavy lifting (drawers, list rows,
// badges, helpers, constants) lives under ./_components/. Everything that
// is exported from this module to keep `import { renewalInfoFor } from
// '@/app/admin/billing/BillingClient'` working from elsewhere in the
// codebase is re-exported below.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';

import { Kpi } from './_components/Badges';
import { AG_STATUS, INV_STATUS } from './_components/constants';
import { getDaysUntil } from './_components/helpers';
import { AgreementList } from './_components/AgreementList';
import { InvoiceList } from './_components/InvoiceList';
import { RenewalsPanel } from './_components/RenewalsPanel';
import { AgreementDrawer } from './_components/AgreementDrawer';
import { InvoiceDrawer } from './_components/InvoiceDrawer';
import type { AdvertiserOption, AdCampaignOption } from './_components/types';

// Re-exports for backward compatibility with callers that imported these
// names from this module (e.g. server-side renewal-bucket consumers).
export { renewalInfoFor, type RenewalBucket } from './_components/helpers';
export type { AdCampaignOption };

type Props = {
  initialAgreements: AgreementWithAdvertiser[];
  initialInvoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  initialRenewalReminders: RenewalReminder[];
};

export default function BillingClient({
  initialAgreements, initialInvoices, advertisers,
  adCampaigns: initialAdCampaigns,
  initialRenewalReminders,
}: Props) {
  const [tab, setTab] = useState<'agreements' | 'invoices' | 'renewals'>('agreements');
  const [agreements, setAgreements] = useState(initialAgreements);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [adCampaigns, setAdCampaigns] = useState(initialAdCampaigns);
  const [reminders, setReminders] = useState<RenewalReminder[]>(initialRenewalReminders);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createAg, setCreateAg] = useState(false);
  const [createInv, setCreateInv] = useState(false);
  const [editAg, setEditAg] = useState<AgreementWithAdvertiser | null>(null);
  const [editInv, setEditInv] = useState<InvoiceWithAdvertiser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const reloadAgreements = useCallback(async () => {
    const res = await fetch('/api/admin/agreements', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) setAgreements((await res.json()).agreements ?? []);
  }, [router]);

  const reloadInvoices = useCallback(async () => {
    const res = await fetch('/api/admin/invoices', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) setInvoices((await res.json()).invoices ?? []);
  }, [router]);

  const reloadAdCampaigns = useCallback(async () => {
    const res = await fetch('/api/admin/ads/campaigns', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) {
      const data = await res.json();
      type RawCampaign = AdCampaignOption & Record<string, unknown>;
      const list = (data.campaigns ?? []) as RawCampaign[];
      setAdCampaigns(list.map((c) => ({
        id: c.id,
        advertiser_name: c.advertiser_name,
        ad_space_slug: c.ad_space_slug,
        publication: c.publication,
        start_date: c.start_date,
        end_date: c.end_date,
        active: c.active,
        advertiser_id: c.advertiser_id ?? null,
        agreement_id: c.agreement_id ?? null,
      })));
    }
  }, [router]);

  const reloadReminders = useCallback(async () => {
    const res = await fetch('/api/admin/renewal-reminders', { cache: 'no-store' });
    if (res.ok) setReminders((await res.json()).reminders ?? []);
  }, []);

  const [invoiceSeed, setInvoiceSeed] = useState<{
    advertiser_id: number | null;
    agreement_id: string;
    amount_cents: number | null;
  } | null>(null);

  const [renewalSeed, setRenewalSeed] = useState<AgreementWithAdvertiser | null>(null);

  // Renewal tab sub-state
  const [renewalTab, setRenewalTab] = useState<'expiring' | 'all_renewals' | 'reminders'>('expiring');

  // ── Renewal / KPI derivations ────────────────────────────────────────────
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const renewalKpis = useMemo(() => {
    let overdue = 0, expiring30 = 0, renewedThisMonth = 0, pendingReminders = 0;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const a of agreements) {
      if (a.status === 'cancelled') continue;
      const days = getDaysUntil(a.exp_date ?? a.end_date);
      if (days !== null && days < 0) overdue++;
      else if (days !== null && days <= 30) expiring30++;
      if (a.is_renewal && a.created_at && new Date(a.created_at) >= startOfMonth) renewedThisMonth++;
    }
    pendingReminders = reminders.filter((r) => r.status === 'Pending').length;
    return { overdue, expiring30, renewedThisMonth, pendingReminders };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agreements, reminders]);

  const expiringSoon = useMemo(() =>
    agreements
      .filter((a) => (a.status === 'signed' || a.status === 'active') && (a.exp_date ?? a.end_date))
      .sort((a, b) => {
        const da = getDaysUntil(a.exp_date ?? a.end_date) ?? 99999;
        const db = getDaysUntil(b.exp_date ?? b.end_date) ?? 99999;
        return da - db;
      }),
  [agreements]);

  const allRenewals = useMemo(() =>
    agreements.filter((a) => a.is_renewal),
  [agreements]);

  // ── Renewal reminder actions ──────────────────────────────────────────────
  const reminderAction = useCallback(async (
    remId: string,
    patch: Record<string, unknown>,
  ) => {
    try {
      const res = await fetch(`/api/admin/renewal-reminders/${remId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reloadReminders();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'action failed');
    }
  }, [reloadReminders]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const filteredAg = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agreements.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.advertiser_name, a.company_name, a.rep_name, a.advertiser_email, a.notes, a.ad_size, a.frequency]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [agreements, query, statusFilter]);

  const filteredInv = useMemo(() => {
    const q = query.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter && !(statusFilter === 'overdue' && i.is_overdue)) return false;
      if (!q) return true;
      return [i.number, i.advertiser_name, i.bill_to_email, i.memo].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [invoices, query, statusFilter]);

  // ── Money summary (top-of-page, all tabs) ─────────────────────────────────
  // Always visible regardless of tab. Sources of truth:
  //   • MTD revenue        → invoices paid this calendar month
  //   • AR outstanding     → invoices not paid/void, sum of total_cents
  //   • Overdue            → same set filtered to is_overdue
  //   • Expiring 30d       → active/signed/sent agreements w/ exp ≤ 30d
  const moneySummary = useMemo(() => {
    const t = new Date();
    const startOfMonth = new Date(t.getFullYear(), t.getMonth(), 1).getTime();
    let mtd = 0, ar = 0, overdue = 0, expiringCount = 0;
    for (const i of invoices) {
      if (i.status === 'paid' && i.paid_at) {
        const paidTs = new Date(i.paid_at).getTime();
        if (paidTs >= startOfMonth) mtd += i.total_cents ?? 0;
      }
      if (i.status !== 'paid' && i.status !== 'void') {
        ar += i.total_cents ?? 0;
        if (i.is_overdue) overdue += i.total_cents ?? 0;
      }
    }
    for (const a of agreements) {
      if (a.status === 'cancelled' || a.status === 'expired') continue;
      const days = getDaysUntil(a.exp_date ?? a.end_date);
      if (days !== null && days >= 0 && days <= 30) expiringCount++;
    }
    return { mtd, ar, overdue, expiringCount };
  }, [agreements, invoices]);

  // ── KPIs (Agreements/Invoices tab) ────────────────────────────────────────
  const kpis = useMemo(() => {
    // 'sent' agreements are in-flight contracts awaiting countersignature —
    // they're effectively active revenue, so the KPI counts them alongside
    // 'active' (BUG-37). Drafts remain a separate bucket.
    const activeAg = agreements.filter((a) => a.status === 'active' || a.status === 'sent').length;
    const draftAg  = agreements.filter((a) => a.status === 'draft').length;
    const outstanding = invoices
      .filter((i) => i.status !== 'paid' && i.status !== 'void')
      .reduce((s, i) => s + (i.total_cents ?? 0), 0);
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 30 * 86400000;
    const paid30 = invoices
      .filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at).getTime() > cutoff)
      .reduce((s, i) => s + (i.total_cents ?? 0), 0);
    return { activeAg, draftAg, outstanding, paid30 };
  }, [agreements, invoices]);

  // ── Upload handler ────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUploadClick = () => fileInputRef.current?.click();
  const handleUploadFile = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/admin/agreements/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`Upload failed HTTP ${res.status}`);
      const data = await res.json();
      await reloadAgreements();
      // Open the newly created stub for editing
      if (data.agreement) setEditAg(data.agreement as AgreementWithAdvertiser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    }
  }, [reloadAgreements]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin · Billing</div>
          <h1 className="text-3xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>Agreements &amp; invoices</h1>
          {/* BUG-38: tagline previously claimed "Stripe state" but no Stripe
              IDs / sync status / customer IDs are surfaced here. Soften the
              copy until the Stripe-sync columns ship. */}
          <p className="text-sm text-gray-600 mt-1">Contracts and invoicing for every advertiser. Stripe charges land via the public Sign Wizard — see each agreement for payment status.</p>
        </div>
        <div className="flex gap-2">
          {tab === 'invoices'
            ? <button onClick={() => setCreateInv(true)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">+ New invoice</button>
            : tab === 'renewals'
              ? <button onClick={() => setTab('agreements')} className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">All agreements →</button>
              : <>
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleUploadFile(f); } e.target.value = ''; }}
                  />
                  <button onClick={handleUploadClick} className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">↑ Upload</button>
                  <button onClick={() => setCreateAg(true)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">+ New agreement</button>
                </>
          }
        </div>
      </div>

      {/* Money summary strip — always visible */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Revenue MTD" value={formatCents(moneySummary.mtd)} accent="emerald" />
        <Kpi label="AR outstanding" value={formatCents(moneySummary.ar)} accent="blue" />
        <Kpi
          label="Overdue"
          value={formatCents(moneySummary.overdue)}
          accent="rose"
          onClick={() => { setTab('invoices'); setStatusFilter('overdue'); }}
        />
        <Kpi
          label="Expiring 30d"
          value={String(moneySummary.expiringCount)}
          accent="amber"
          onClick={() => { setTab('renewals'); setRenewalTab('expiring'); }}
        />
      </div>

      {/* Tab-scoped KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tab === 'renewals' ? (
          <>
            <Kpi label="Overdue" value={String(renewalKpis.overdue)} accent="rose" />
            <Kpi label="Expiring 30d" value={String(renewalKpis.expiring30)} accent="amber" />
            <Kpi label="Renewed this month" value={String(renewalKpis.renewedThisMonth)} accent="emerald" />
            <Kpi label="Pending reminders" value={String(renewalKpis.pendingReminders)} accent="blue"
              onClick={() => setRenewalTab('reminders')} />
          </>
        ) : (
          <>
            <Kpi label="Active + sent" value={String(kpis.activeAg)} />
            <Kpi label="Drafts" value={String(kpis.draftAg)} />
            <Kpi label="Outstanding" value={formatCents(kpis.outstanding)} />
            <Kpi label="Paid (30d)" value={formatCents(kpis.paid30)} />
          </>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['agreements','invoices','renewals'] as const).map((t) => {
          const label = t === 'agreements' ? 'Agreements' : t === 'invoices' ? 'Invoices' : 'Renewals';
          const count = t === 'agreements' ? agreements.length
                      : t === 'invoices' ? invoices.length
                      : expiringSoon.length;
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setStatusFilter('all'); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              <span className={`ml-2 text-xs ${tab === t ? 'text-blue-600' : 'text-gray-400'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters — hidden on renewals tab */}
      {tab !== 'renewals' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-2 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'agreements' ? 'Search advertiser, ad size…' : 'Search invoice #, advertiser…'}
            className="flex-1 min-w-[240px] px-3 py-2 rounded border border-gray-300 text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded border border-gray-300 text-sm">
            <option value="all">All statuses</option>
            {(tab === 'agreements' ? AG_STATUS : INV_STATUS).map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Lists */}
      {tab === 'agreements' ? (
        <AgreementList
          rows={filteredAg}
          onOpen={(r) => setEditAg(r)}
          onEmail={async (r) => {
            try {
              const res = await fetch(`/api/admin/agreements/${r.id}/send`, { method: 'POST' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const d = await res.json();
              showToast(`Signing link sent to ${d.sentTo ?? r.advertiser_email ?? 'advertiser'}`);
              await reloadAgreements();
            } catch (e) { setError(e instanceof Error ? e.message : 'send failed'); }
          }}
        />
      ) : tab === 'invoices' ? (
        <InvoiceList rows={filteredInv} onOpen={(r) => setEditInv(r)} />
      ) : (
        <RenewalsPanel
          expiringSoon={expiringSoon}
          allRenewals={allRenewals}
          reminders={reminders}
          activeTab={renewalTab}
          onTabChange={setRenewalTab}
          onOpen={(r) => setEditAg(r)}
          onRenew={(r) => setRenewalSeed(r)}
          onReminderAction={reminderAction}
          onSendRenewal={async (r) => {
            try {
              const res = await fetch(`/api/admin/agreements/${r.id}/send-renewal`, { method: 'POST' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const d = await res.json();
              showToast(`Renewal email sent to ${d.sentTo ?? r.advertiser_email ?? 'advertiser'}`);
            } catch (e) { setError(e instanceof Error ? e.message : 'send renewal failed'); }
          }}
          onSendReminder={async (r) => {
            try {
              const res = await fetch(`/api/admin/renewal-reminders/${r.id}/send`, { method: 'POST' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const d = await res.json();
              showToast(`Reminder email sent to ${d.sentTo ?? r.email ?? 'advertiser'}`);
              await reloadReminders();
            } catch (e) { setError(e instanceof Error ? e.message : 'send reminder failed'); }
          }}
        />
      )}

      {/* Modals */}
      {createAg && (
        <AgreementDrawer
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setCreateAg(false)}
          onSaved={async () => { setCreateAg(false); await reloadAgreements(); await reloadAdCampaigns(); await reloadReminders(); }}
          onError={setError}
        />
      )}
      {renewalSeed && (
        <AgreementDrawer
          renewedFrom={renewalSeed}
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setRenewalSeed(null)}
          onSaved={async () => { setRenewalSeed(null); await reloadAgreements(); await reloadAdCampaigns(); await reloadReminders(); }}
          onError={setError}
        />
      )}
      {editAg && (
        <AgreementDrawer
          existing={editAg}
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setEditAg(null)}
          onSaved={async () => { setEditAg(null); await reloadAgreements(); await reloadAdCampaigns(); await reloadReminders(); }}
          onError={setError}
          onGenerateInvoice={(seed) => {
            setEditAg(null);
            setInvoiceSeed(seed);
            setCreateInv(true);
            setTab('invoices');
          }}
        />
      )}
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
