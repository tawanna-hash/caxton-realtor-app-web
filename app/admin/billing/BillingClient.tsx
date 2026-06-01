'use client';

// app/admin/billing/BillingClient.tsx
//
// Tabbed billing workspace. Agreements + Invoices + Renewals. Each tab is a
// filterable list with a "+" affordance opening the matching create drawer.

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AgreementWithAdvertiser, AgreementStatus, AgreementType, PaymentMode,
} from '@/lib/agreements';
import type {
  InvoiceWithAdvertiser, InvoiceStatus, InvoiceLineItem,
} from '@/lib/invoices';
import { formatCents, lineItemsTotal } from '@/lib/invoices';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';
import {
  MONTHS_LIST, FREQ_PKG_AG,
  AD_SIZES, FREQUENCIES, PAYMENT_TYPES, CARD_TYPES, BILL_TO,
} from '@/lib/pressbook-constants';
import { TERMS_RL } from '@/lib/agreement-terms';
import {
  lookupRate, applyCcSurcharge, pagePositionPremium, computeExp,
} from '@/lib/agreement-pricing';

// ── helpers ───────────────────────────────────────────────────────────────────

function formatPhone(s: string | null | undefined): string {
  if (!s) return '';
  const d = s.replace(/\D/g, '').slice(0, 10);
  if (!d) return '';
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Coerce a `timestamptz`/`date` value (string | Date | null) to a YYYY-MM-DD string. */
function toISODateString(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  // Some neon driver paths return ISO-shaped objects — fall back to String()
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function getDaysUntil(s: string | Date | null | undefined): number | null {
  const iso = toISODateString(s);
  if (!iso) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const e = new Date(iso); e.setHours(0, 0, 0, 0);
  if (Number.isNaN(e.getTime())) return null;
  return Math.round((e.getTime() - t.getTime()) / 86400000);
}

function humanDate(iso: string | Date | null | undefined): string {
  const s = toISODateString(iso);
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return s;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return s; }
}

type AdvertiserOption = { id: number; name: string; publication: string };

export type AdCampaignOption = {
  id: string;
  advertiser_name: string;
  ad_space_slug: string;
  publication: string;
  start_date: string | Date | null;
  end_date: string | Date | null;
  active: boolean;
  advertiser_id: number | null;
  agreement_id: string | null;
};

/** Format a DATE column value as YYYY-MM-DD (display version returns em-dash for null). */
function formatDateISO(d: string | Date | null | undefined): string {
  if (d == null) return '—';
  const s = toISODateString(d);
  return s || '—';
}

type Props = {
  initialAgreements: AgreementWithAdvertiser[];
  initialInvoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  initialRenewalReminders: RenewalReminder[];
};

const AG_STATUS: { value: AgreementStatus; label: string; tone: string }[] = [
  { value: 'draft',     label: 'Draft',     tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',      label: 'Sent',      tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'signed',    label: 'Signed',    tone: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { value: 'active',    label: 'Active',    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'expired',   label: 'Expired',   tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bg-rose-50 text-rose-700 border-rose-200' },
];
const INV_STATUS: { value: InvoiceStatus; label: string; tone: string }[] = [
  { value: 'draft',   label: 'Draft',   tone: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'sent',    label: 'Sent',    tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'paid',    label: 'Paid',    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'overdue', label: 'Overdue', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'void',    label: 'Void',    tone: 'bg-rose-50 text-rose-700 border-rose-200' },
];
const AG_TYPES: { value: AgreementType; label: string }[] = [
  { value: 'print_ad',          label: 'Print ad' },
  { value: 'eblast',            label: 'Eblast' },
  { value: 'sponsored_content', label: 'Sponsored content' },
  { value: 'package',           label: 'Package' },
  { value: 'other',             label: 'Other' },
];
const PAY_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'card',    label: 'Card' },
  { value: 'link',    label: 'Stripe link' },
  { value: 'invoice', label: 'Invoice (manual)' },
  { value: 'check',   label: 'Check' },
];

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

  // ── KPIs (Agreements/Invoices tab) ────────────────────────────────────────
  const kpis = useMemo(() => {
    const activeAg = agreements.filter((a) => a.status === 'active').length;
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
          <p className="text-sm text-gray-600 mt-1">Contracts, billing, and Stripe state for every advertiser.</p>
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

      {/* KPIs */}
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
            <Kpi label="Active agreements" value={String(kpis.activeAg)} />
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

// ──────────────────────────────────────────────────────────────────
// KPI card
// ──────────────────────────────────────────────────────────────────
type KpiAccent = 'blue' | 'rose' | 'amber' | 'emerald' | undefined;
function Kpi({ label, value, accent, onClick }: { label: string; value: string; accent?: KpiAccent; onClick?: () => void }) {
  const borderCls = accent === 'rose' ? 'border-l-4 border-l-rose-500'
    : accent === 'amber' ? 'border-l-4 border-l-amber-500'
    : accent === 'emerald' ? 'border-l-4 border-l-emerald-500'
    : accent === 'blue' ? 'border-l-4 border-l-blue-500'
    : '';
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 ${borderCls} ${onClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
      onClick={onClick}
    >
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{label}</div>
      <div className="text-2xl text-gray-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>{value}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Status pill
// ──────────────────────────────────────────────────────────────────
function StatusPill({ value, options }: { value: string; options: { value: string; label: string; tone: string }[] }) {
  const opt = options.find((o) => o.value === value) ?? options[0];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${opt.tone}`}>{opt.label}</span>;
}

// ──────────────────────────────────────────────────────────────────
// Agreement list
// ──────────────────────────────────────────────────────────────────
function AgreementList({
  rows, onOpen, onEmail,
}: {
  rows: AgreementWithAdvertiser[];
  onOpen: (r: AgreementWithAdvertiser) => void;
  onEmail?: (r: AgreementWithAdvertiser) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No agreements yet.</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">Type · Size</div>
        <div className="col-span-2">Term</div>
        <div className="col-span-2">Amount</div>
        <div className="col-span-1">Invoiced</div>
        <div className="col-span-2">Status · Actions</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-blue-50/40">
            <button onClick={() => onOpen(r)} className="col-span-3 text-left min-w-0">
              <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? r.company_name ?? '—'}</div>
              <div className="text-xs text-gray-500 truncate">{r.rep_name ?? r.advertiser_email ?? ''}</div>
            </button>
            <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm text-gray-700">
              <div>{AG_TYPES.find((t) => t.value === r.type)?.label ?? r.type ?? '—'}</div>
              <div className="text-xs text-gray-500">{r.ad_size ?? ''} {r.frequency ? `· ${r.frequency}` : ''}</div>
            </button>
            <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm text-gray-700">
              {r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
              {' → '}
              {r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}
            </button>
            <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm text-gray-900">{formatCents(r.amount_cents)}</button>
            <button onClick={() => onOpen(r)} className="col-span-1 text-left text-sm text-gray-700">{formatCents(r.invoiced_cents)}</button>
            <div className="col-span-2 flex items-center gap-1 flex-wrap">
              <StatusPill value={r.status} options={AG_STATUS} />
              <button
                title="Send signing link email"
                onClick={() => onEmail?.(r)}
                className="p-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >✉</button>
              <a
                href={`/api/admin/agreements/${r.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                title="Download PDF"
                className="p-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >PDF</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Renewals panel (3 sub-tabs + stat cards already rendered above)
// ──────────────────────────────────────────────────────────────────

function DaysBadge({ days }: { days: number | null }) {
  if (days == null) return <span className="text-gray-400 text-xs">—</span>;
  const cls = days < 0
    ? 'bg-rose-100 text-rose-700 border-rose-300'
    : days <= 14
      ? 'bg-amber-100 text-amber-700 border-amber-300'
      : 'bg-emerald-100 text-emerald-700 border-emerald-300';
  const label = days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>{label}</span>;
}

function ReminderStatusBadge({ status }: { status: string }) {
  const cls = status === 'Pending'
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : status === 'Completed'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>{status}</span>;
}

function RenewalsPanel({
  expiringSoon, allRenewals, reminders, activeTab, onTabChange, onOpen, onRenew, onReminderAction,
  onSendRenewal, onSendReminder,
}: {
  expiringSoon: AgreementWithAdvertiser[];
  allRenewals: AgreementWithAdvertiser[];
  reminders: RenewalReminder[];
  activeTab: 'expiring' | 'all_renewals' | 'reminders';
  onTabChange: (t: 'expiring' | 'all_renewals' | 'reminders') => void;
  onOpen: (r: AgreementWithAdvertiser) => void;
  onRenew: (r: AgreementWithAdvertiser) => void;
  onReminderAction: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onSendRenewal?: (r: AgreementWithAdvertiser) => Promise<void>;
  onSendReminder?: (r: RenewalReminder) => Promise<void>;
}) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const subTabs: { key: 'expiring' | 'all_renewals' | 'reminders'; label: string; count: number }[] = [
    { key: 'expiring',      label: 'Expiring Soon',    count: expiringSoon.length },
    { key: 'all_renewals',  label: 'All Renewals',     count: allRenewals.length },
    { key: 'reminders',     label: 'Renewal Reminders',count: reminders.length },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-gray-200">
        {subTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              activeTab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-gray-400">({t.count})</span>
          </button>
        ))}
      </div>

      {activeTab === 'expiring' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Email</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-1">Rate</div>
            <div className="col-span-1">Exp Date</div>
            <div className="col-span-1">Days</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {expiringSoon.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No agreements expiring soon.</div>
            : <div className="divide-y divide-gray-100">
              {expiringSoon.map((r) => {
                const days = getDaysUntil(r.exp_date ?? r.end_date);
                return (
                  <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-blue-50/30">
                    <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</button>
                    <div className="col-span-2 text-xs text-gray-600 truncate">{r.advertiser_email ?? '—'}</div>
                    <div className="col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                    <div className="col-span-1 text-xs text-gray-600">{r.ad_size ?? '—'}</div>
                    <div className="col-span-1 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</div>
                    <div className="col-span-1 text-xs text-gray-600">{r.exp_date ? humanDate(r.exp_date) : '—'}</div>
                    <div className="col-span-1"><DaysBadge days={days} /></div>
                    <div className="col-span-1"><StatusPill value={r.status} options={AG_STATUS} /></div>
                    <div className="col-span-1 flex gap-1 justify-end">
                      <button
                        className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                        title="Send renewal email"
                        onClick={() => onSendRenewal?.(r)}
                      >Email</button>
                      <button
                        className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => onRenew(r)}
                      >Renew</button>
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}

      {activeTab === 'all_renewals' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Email</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-2">Rate</div>
            <div className="col-span-2">Signed</div>
            <div className="col-span-1">Status</div>
          </div>
          {allRenewals.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No renewals yet.</div>
            : <div className="divide-y divide-gray-100">
              {allRenewals.map((r) => (
                <button key={r.id} onClick={() => onOpen(r)} className="w-full grid grid-cols-12 gap-2 px-4 py-3 text-left items-center hover:bg-blue-50/30">
                  <div className="col-span-2 text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</div>
                  <div className="col-span-2 text-xs text-gray-600 truncate">{r.advertiser_email ?? '—'}</div>
                  <div className="col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                  <div className="col-span-1 text-xs text-gray-600">{r.ad_size ?? '—'}</div>
                  <div className="col-span-2 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}/mo` : '—'}</div>
                  <div className="col-span-2 text-xs text-gray-600">{r.signed_at ? new Date(r.signed_at).toLocaleDateString() : '—'}</div>
                  <div className="col-span-1"><StatusPill value={r.status} options={AG_STATUS} /></div>
                </button>
              ))}
            </div>
          }
        </div>
      )}

      {activeTab === 'reminders' && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
            <div className="col-span-2">Client</div>
            <div className="col-span-2">Company</div>
            <div className="col-span-1">Rate</div>
            <div className="col-span-1">Expires</div>
            <div className="col-span-1">Days</div>
            <div className="col-span-2">Remind On</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
          {reminders.length === 0
            ? <div className="p-8 text-center text-sm text-gray-500">No renewal reminders yet.</div>
            : <div className="divide-y divide-gray-100">
              {reminders.map((r) => {
                const daysLeft = getDaysUntil(r.exp_date);
                const remindDays = getDaysUntil(r.remind_date);
                const remindUrgency = remindDays !== null && remindDays <= 0
                  ? 'text-rose-600 font-semibold'
                  : remindDays !== null && remindDays <= 7
                    ? 'text-amber-600'
                    : 'text-gray-600';
                return (
                  <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 items-start hover:bg-gray-50/40">
                    <div className="col-span-2 text-sm font-medium text-gray-900 truncate">{r.rep_name ?? '—'}</div>
                    <div className="col-span-2 text-xs text-gray-600 truncate">{r.company_name ?? '—'}</div>
                    <div className="col-span-1 text-xs text-gray-700">{r.ad_rate_cents != null ? `$${(r.ad_rate_cents / 100).toFixed(0)}` : '—'}</div>
                    <div className="col-span-1 text-xs text-gray-600">{r.exp_date ? humanDate(r.exp_date) : '—'}</div>
                    <div className="col-span-1"><DaysBadge days={daysLeft} /></div>
                    <div className={`col-span-2 text-xs ${remindUrgency}`}>{r.remind_date ? humanDate(r.remind_date) : '—'}</div>
                    <div className="col-span-1"><ReminderStatusBadge status={r.status} /></div>
                    <div className="col-span-2 flex flex-col gap-1 items-end">
                      {noteId === r.id ? (
                        <div className="w-full space-y-1">
                          <textarea
                            className="w-full text-xs px-2 py-1 border border-gray-300 rounded resize-none"
                            rows={2}
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add a note…"
                          />
                          <div className="flex gap-1 justify-end">
                            <button className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600" onClick={() => setNoteId(null)}>Cancel</button>
                            <button className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white" onClick={async () => {
                              await onReminderAction(r.id, { note: noteText });
                              setNoteId(null); setNoteText('');
                            }}>Save</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-1 flex-wrap justify-end">
                          <button className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            onClick={() => onSendReminder?.(r)}>Email</button>
                          {r.status === 'Pending' && <>
                            <button className="px-2 py-0.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => onReminderAction(r.id, { status: 'Completed' })}>Complete</button>
                            <button className="px-2 py-0.5 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                              onClick={() => { setNoteId(r.id); setNoteText(r.note ?? ''); }}>Note</button>
                            <button className="px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                              onClick={() => onReminderAction(r.id, { status: 'Dismissed' })}>Dismiss</button>
                          </>}
                        </div>
                      )}
                      {r.note && noteId !== r.id && (
                        <div className="text-xs text-gray-500 italic text-right max-w-[10rem] truncate" title={r.note}>{r.note}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          }
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Renewal info helper (kept for backward compat if needed elsewhere)
// ──────────────────────────────────────────────────────────────────
export type RenewalBucket = 'expired' | 'due_soon' | 'upcoming' | 'fresh';

export function renewalInfoFor(ag: AgreementWithAdvertiser): {
  bucket: RenewalBucket;
  daysUntilExpiry: number | null;
  noticeSent: boolean;
} {
  const noticeSent = !!ag.renewal_notice_date;
  const expDate = ag.exp_date ?? ag.end_date;
  if (!expDate) return { bucket: 'fresh', daysUntilExpiry: null, noticeSent };
  const days = getDaysUntil(expDate as string);
  let bucket: RenewalBucket;
  if (days === null) bucket = 'fresh';
  else if (days < 0) bucket = 'expired';
  else if (days <= 30) bucket = 'due_soon';
  else if (days <= 90) bucket = 'upcoming';
  else bucket = 'fresh';
  return { bucket, daysUntilExpiry: days, noticeSent };
}

// ──────────────────────────────────────────────────────────────────
// Invoice list
// ──────────────────────────────────────────────────────────────────
function PaidStamp({ paidAt }: { paidAt: string | null }) {
  return (
    <span
      title={paidAt ? `Paid ${new Date(paidAt).toLocaleDateString()}` : 'Paid'}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border-2 border-emerald-600 text-emerald-700 bg-emerald-50"
      style={{ transform: 'rotate(-2deg)' }}
    >
      ✓ Paid
    </span>
  );
}

function UnpaidBadge({ overdue }: { overdue: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border ${
        overdue
          ? 'border-amber-500 text-amber-700 bg-amber-50'
          : 'border-gray-300 text-gray-600 bg-gray-50'
      }`}
    >
      {overdue ? 'Overdue' : 'Unpaid'}
    </span>
  );
}

function InvoiceList({ rows, onOpen }: { rows: InvoiceWithAdvertiser[]; onOpen: (r: InvoiceWithAdvertiser) => void }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No invoices yet.</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-2">Number</div>
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">Total</div>
        <div className="col-span-2">Due</div>
        <div className="col-span-2">Payment</div>
        <div className="col-span-1">Status</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const isPaid = r.status === 'paid';
          const isVoid = r.status === 'void';
          return (
            <button key={r.id} onClick={() => onOpen(r)} className={`w-full grid grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-blue-50/40 ${isPaid ? 'bg-emerald-50/30' : ''}`}>
              <div className="col-span-2 font-mono text-sm text-gray-700">{r.number ?? '—'}</div>
              <div className="col-span-3 min-w-0">
                <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? '—'}</div>
                <div className="text-xs text-gray-500 truncate">{r.bill_to_email ?? ''}</div>
              </div>
              <div className="col-span-2 text-sm text-gray-900">{formatCents(r.total_cents)}</div>
              <div className="col-span-2 text-sm text-gray-700">
                {r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}
              </div>
              <div className="col-span-2">
                {isPaid
                  ? <PaidStamp paidAt={r.paid_at} />
                  : isVoid
                    ? <span className="text-xs text-rose-600 font-medium uppercase tracking-wider">Void</span>
                    : <UnpaidBadge overdue={!!r.is_overdue} />}
              </div>
              <div className="col-span-1"><StatusPill value={r.status} options={INV_STATUS} /></div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Agreement drawer — full Pressbook parity
// ──────────────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const INPUT_READONLY = 'w-full px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm text-gray-600 cursor-not-allowed';

type AgForm = {
  // Advertiser info
  company_name: string;
  rep_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  // Insertion order
  ad_size: string;
  frequency: string;
  ad_rate: string;         // display rate (may include CC surcharge)
  ad_rate_base: string;    // base rate before CC
  rate_user_edited: boolean;
  discount: string;
  ad_premium: string;
  pos_premium_active: boolean;
  page_position: string;
  ad_timing_months: Record<string, boolean>;
  ad_timing_years: Record<string, string>;
  // Billing
  bill_to: string;
  billing_email: string;
  billing_contact_name: string;
  billing_contact_phone: string;
  payment_type: string;
  card_type: string;
  cardholder_name: string;
  card_number_last4: string;
  card_expiration: string;
  cardholder_address: string;
  // Signature
  terms_accepted: boolean;
  sign_date: string;
  signer_name: string;
  // Internal
  notes: string;
  status: AgreementStatus;
  // Legacy
  advertiser_id: number | null;
  type: AgreementType | null;
  payment_mode: PaymentMode | null;
  ad_campaign_id: string;
  // Attachments (new files to upload)
  pendingFiles: File[];
};

function initTimingChecked(existing?: AgreementWithAdvertiser | null): Record<string, boolean> {
  const tm = existing?.ad_timing_months;
  return Object.fromEntries(
    MONTHS_LIST.map((m) => [m.k, tm ? !!tm[m.k] : false]),
  );
}

function initTimingYears(existing?: AgreementWithAdvertiser | null): Record<string, string> {
  const tm = existing?.ad_timing_months;
  return Object.fromEntries(
    MONTHS_LIST.map((m) => [m.k, tm?.[m.k] ?? '']),
  );
}

function AgreementDrawer({
  existing, renewedFrom, advertisers, adCampaigns, onClose, onSaved, onError, onGenerateInvoice,
}: {
  existing?: AgreementWithAdvertiser;
  renewedFrom?: AgreementWithAdvertiser;
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  onGenerateInvoice?: (seed: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null }) => void;
}) {
  const linkedCampaign = useMemo(
    () => existing ? (adCampaigns.find((c) => c.agreement_id === existing.id) ?? null) : null,
    [adCampaigns, existing],
  );

  const seed: AgreementWithAdvertiser | undefined = existing ?? renewedFrom;
  const isCreate = !existing;
  const isUploaded = !!existing?.is_uploaded;

  // Derive initial rate from seed or rate table
  const initRateAndBase = useMemo(() => {
    if (seed?.ad_rate_cents != null) {
      const payType = seed.payment_mode === 'card' ? 'Credit Card' : 'Check';
      const base = payType === 'Credit Card'
        ? Math.round((seed.ad_rate_cents / 100 / 1.03) * 100) / 100
        : seed.ad_rate_cents / 100;
      return { rate: String(seed.ad_rate_cents / 100), base: String(base) };
    }
    const freq = seed?.frequency ?? '1x';
    const size = seed?.ad_size ?? '1/4 page';
    const looked = lookupRate(freq, size);
    if (looked) return { rate: String(looked.rate), base: String(looked.rate) };
    return { rate: '', base: '' };
  }, [seed]);

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<AgForm>({
    company_name:         seed?.company_name ?? '',
    rep_name:             seed?.rep_name ?? '',
    phone:                formatPhone(seed?.advertiser_phone),
    email:                seed?.advertiser_email ?? '',
    address:              seed?.address ?? '',
    city:                 seed?.city ?? '',
    state:                seed?.state ?? 'TX',
    zip:                  seed?.zip ?? '',
    ad_size:              seed?.ad_size ?? '1/4 page',
    frequency:            seed?.frequency ?? '1x',
    ad_rate:              initRateAndBase.rate,
    ad_rate_base:         initRateAndBase.base,
    rate_user_edited:     seed?.ad_rate_cents != null,
    discount:             seed?.discount_cents != null ? String(seed.discount_cents / 100) : '',
    ad_premium:           seed?.ad_premium_cents != null ? String(seed.ad_premium_cents / 100) : '',
    pos_premium_active:   false,
    page_position:        seed?.page_position ?? '',
    ad_timing_months:     initTimingChecked(seed),
    ad_timing_years:      initTimingYears(seed),
    bill_to:              seed?.bill_to ?? 'Advertiser',
    billing_email:        seed?.billing_email ?? seed?.advertiser_email ?? '',
    billing_contact_name: seed?.billing_contact_name ?? '',
    billing_contact_phone:formatPhone(seed?.billing_contact_phone),
    payment_type:         seed?.card_type ? 'Credit Card' : 'Check',
    card_type:            seed?.card_type ?? 'Visa',
    cardholder_name:      seed?.cardholder_name ?? '',
    card_number_last4:    seed?.card_number_last4 ?? '',
    card_expiration:      seed?.card_expiration ?? '',
    cardholder_address:   seed?.cardholder_address ?? '',
    terms_accepted:       seed?.terms_accepted ?? false,
    sign_date:            toISODateString(existing?.signed_at) || today,
    signer_name:          seed?.signer_name ?? '',
    notes:                existing?.notes ?? (renewedFrom ? `Renewed from agreement ${renewedFrom.id}` : ''),
    status:               (existing?.status ?? 'draft') as AgreementStatus,
    advertiser_id:        seed?.advertiser_id ?? null,
    type:                 (seed?.type ?? null) as AgreementType | null,
    payment_mode:         (seed?.payment_mode ?? null) as PaymentMode | null,
    ad_campaign_id:       (linkedCampaign?.id ?? '') as string,
    pendingFiles:         [],
  });

  const [saving, setSaving] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const upd = <K extends keyof AgForm>(k: K, v: AgForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Computed values
  const adRate = parseFloat(form.ad_rate) || 0;
  const discount = parseFloat(form.discount) || 0;
  const adPremium = parseFloat(form.ad_premium) || 0;
  const totalMonthly = adRate - discount + adPremium;

  // Expiration preview
  const expPreview = useMemo(() =>
    computeExp(form.ad_timing_months, form.ad_timing_years, form.frequency, form.sign_date),
  [form.ad_timing_months, form.ad_timing_years, form.frequency, form.sign_date]);

  const remindPreview = useMemo(() => {
    if (!expPreview) return '';
    const d = new Date(expPreview + 'T00:00:00');
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [expPreview]);

  // Auto-fill rate from table when size/freq changes (unless user edited)
  const onSizeFrChange = (size: string, freq: string) => {
    if (!form.rate_user_edited) {
      const looked = lookupRate(freq, size);
      if (looked) {
        const rate = form.payment_type === 'Credit Card'
          ? String(applyCcSurcharge(looked.rate))
          : String(looked.rate);
        upd('ad_rate', rate);
        upd('ad_rate_base', String(looked.rate));
        // Recalc premium if pos_premium_active
        if (form.pos_premium_active) {
          upd('ad_premium', String(pagePositionPremium(looked.rate)));
        }
      }
    }
  };

  // When payment type changes, recalc rate if CC
  const onPayTypeChange = (pt: string) => {
    upd('payment_type', pt);
    const base = parseFloat(form.ad_rate_base) || 0;
    if (base > 0) {
      const newRate = pt === 'Credit Card' ? String(applyCcSurcharge(base)) : String(base);
      upd('ad_rate', newRate);
    }
  };

  // Toggle pos premium
  const onTogglePosPremium = (active: boolean) => {
    upd('pos_premium_active', active);
    const base = parseFloat(form.ad_rate_base) || 0;
    if (active && base > 0) {
      upd('ad_premium', String(pagePositionPremium(base)));
    } else if (!active) {
      upd('ad_premium', '');
    }
  };

  const campaignChoices = useMemo(() => {
    const eligible = adCampaigns.filter((c) =>
      c.agreement_id === null || (existing && c.agreement_id === existing.id),
    );
    if (form.advertiser_id) {
      const own = eligible.filter((c) => c.advertiser_id === form.advertiser_id);
      const rest = eligible.filter((c) => c.advertiser_id !== form.advertiser_id);
      return [...own, ...rest];
    }
    return eligible;
  }, [adCampaigns, existing, form.advertiser_id]);

  const canSign = form.terms_accepted && form.signer_name.trim() !== '' && form.sign_date !== '';

  const buildPayload = (isSigning: boolean) => {
    const rateCents = Math.round((parseFloat(form.ad_rate) || 0) * 100);
    const discCents = Math.round((parseFloat(form.discount) || 0) * 100);
    const premCents = Math.round((parseFloat(form.ad_premium) || 0) * 100);
    const totalCents = Math.round(totalMonthly * 100);
    const timingMonths: Record<string, string> = {};
    for (const m of MONTHS_LIST) {
      if (form.ad_timing_months[m.k]) timingMonths[m.k] = form.ad_timing_years[m.k] ?? '';
    }

    return {
      company_name:            form.company_name || null,
      rep_name:                form.rep_name || null,
      advertiser_email:        form.email || null,
      advertiser_phone:        form.phone || null,
      address:                 form.address || null,
      city:                    form.city || null,
      state:                   form.state || null,
      zip:                     form.zip || null,
      ad_size:                 form.ad_size || null,
      frequency:               form.frequency || null,
      ad_rate_cents:           rateCents || null,
      discount_cents:          discCents || null,
      ad_premium_cents:        premCents || null,
      total_monthly_rate_cents:totalCents || null,
      page_position:           form.page_position || null,
      ad_timing_months:        Object.keys(timingMonths).length > 0 ? timingMonths : null,
      bill_to:                 form.bill_to,
      billing_email:           form.billing_email || null,
      billing_contact_name:    form.billing_contact_name || null,
      billing_contact_phone:   form.billing_contact_phone || null,
      payment_type:            form.payment_type,
      card_type:               form.payment_type === 'Credit Card' ? form.card_type : null,
      cardholder_name:         form.payment_type === 'Credit Card' ? form.cardholder_name || null : null,
      card_number_last4:       form.payment_type === 'Credit Card' ? form.card_number_last4 || null : null,
      card_expiration:         form.payment_type === 'Credit Card' ? form.card_expiration || null : null,
      cardholder_address:      form.payment_type === 'Credit Card' ? form.cardholder_address || null : null,
      notes:                   form.notes || null,
      status:                  isSigning ? 'signed' : form.status,
      advertiser_id:           form.advertiser_id,
      type:                    form.type || null,
      payment_mode:            form.payment_mode || null,
      exp_date:                expPreview || null,
      end_date:                expPreview || null,
      signer_name:             isSigning ? form.signer_name || null : form.signer_name || null,
      terms_accepted:          isSigning ? true : form.terms_accepted || null,
      terms_accepted_at:       isSigning ? new Date().toISOString() : null,
      signed_at:               isSigning ? (form.sign_date + 'T00:00:00.000Z') : null,
      is_renewal:              !!renewedFrom,
      renewed_from_id:         renewedFrom?.id ?? null,
    };
  };

  const save = async (isSigning: boolean) => {
    if (!isCreate && !existing) return;
    setSaving(true);
    try {
      const payload = buildPayload(isSigning);
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing!.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const saved = await res.json();
      const agreementId = saved.agreement?.id ?? existing?.id;

      // Upload pending files
      if (form.pendingFiles.length > 0 && agreementId) {
        const existingFiles = (existing?.attachments?.files ?? []) as Array<Record<string, unknown>>;
        const newFiles: Array<Record<string, unknown>> = [];
        for (const file of form.pendingFiles) {
          const fd = new FormData(); fd.append('file', file);
          const r = await fetch('/api/admin/agreements/upload', { method: 'POST', body: fd });
          if (r.ok) {
            const d = await r.json();
            const uploaded = d.agreement?.attachments?.files?.[0] as Record<string, unknown> | undefined;
            if (uploaded) newFiles.push(uploaded);
          }
        }
        if (newFiles.length > 0) {
          await fetch(`/api/admin/agreements/${agreementId}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ attachments: { files: [...existingFiles, ...newFiles] } }),
          });
        }
      }

      // Sync campaign link if changed
      const previousCampaignId = linkedCampaign?.id ?? '';
      if (agreementId && form.ad_campaign_id !== previousCampaignId) {
        const linkRes = await fetch(`/api/admin/agreements/${agreementId}/link-campaign`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ad_campaign_id: form.ad_campaign_id || null }),
        });
        if (!linkRes.ok) {
          const detail = await linkRes.text();
          throw new Error(`campaign link failed: ${detail}`);
        }
      }

      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  const [signingMsg, setSigningMsg] = useState<string | null>(null);

  const sendSigningLink = async () => {
    setSaving(true);
    setSigningMsg(null);
    try {
      // 1. Save/create the agreement first as draft
      const payload = buildPayload(false);
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing!.id}`;
      const saveRes = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!saveRes.ok) throw new Error(`Save failed HTTP ${saveRes.status}`);
      const saved = await saveRes.json();
      const agreementId: string = saved.agreement?.id ?? existing?.id ?? '';

      if (!agreementId) throw new Error('No agreement ID after save');

      // 2. POST to send route — builds sign URL + emails it
      const sendRes = await fetch(`/api/admin/agreements/${agreementId}/send`, { method: 'POST' });
      if (!sendRes.ok) throw new Error(`Send failed HTTP ${sendRes.status}`);
      const sendData = await sendRes.json();
      const sentTo: string = sendData.sentTo ?? form.email ?? 'advertiser';
      setSigningMsg(`Signing link sent to ${sentTo}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'send link failed');
    } finally {
      setSaving(false);
    }
  };

  const copySigningLink = async () => {
    if (!existing?.id) { onError('Save the agreement first'); return; }
    try {
      const res = await fetch(`/api/admin/agreements/${existing.id}/sign-link`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setSigningMsg('Signing link copied to clipboard!');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'copy failed');
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/agreements/${existing.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerShell
      title={isCreate
        ? (renewedFrom ? `Renew — ${renewedFrom.company_name ?? renewedFrom.advertiser_name ?? 'agreement'}` : 'New agreement')
        : (existing?.company_name ?? existing?.advertiser_name ?? 'Agreement')}
      subtitle={isCreate
        ? (renewedFrom ? `Draft renewal of ${renewedFrom.id}` : 'Contract — draft by default')
        : existing?.id}
      onClose={onClose}
    >
      {!isCreate && onGenerateInvoice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-blue-700 font-medium">Invoice</div>
            <div className="text-sm text-gray-800 mt-0.5">
              {existing && (existing.invoiced_cents > 0
                ? <>Invoiced so far: <span className="font-medium">{formatCents(existing.invoiced_cents)}</span> of {formatCents(existing.amount_cents)}</>
                : <>No invoices yet for this agreement.</>)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onGenerateInvoice({ advertiser_id: existing!.advertiser_id, agreement_id: existing!.id, amount_cents: existing!.amount_cents })}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
          >
            Generate invoice
          </button>
        </div>
      )}

      {/* ── Advertiser Information ── */}
      <Section title="Advertiser Information">
        <Field label="Company Name *">
          <input value={form.company_name} onChange={(e) => upd('company_name', e.target.value)}
            className={INPUT} placeholder="Advertiser company name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Representative Name *">
            <input value={form.rep_name} onChange={(e) => upd('rep_name', e.target.value)}
              className={INPUT} placeholder="Full name" />
          </Field>
          <Field label="Contact Number">
            <input value={form.phone}
              onChange={(e) => upd('phone', formatPhone(e.target.value))}
              className={INPUT} placeholder="555-000-0000" />
          </Field>
          <Field label="Email">
            <input value={form.email} type="email"
              onChange={(e) => upd('email', e.target.value)}
              className={INPUT} placeholder="email@company.com" />
          </Field>
          <Field label="Mailing Address">
            <input value={form.address} onChange={(e) => upd('address', e.target.value)}
              className={INPUT} placeholder="Street address" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" className="col-span-1">
            <input value={form.city} onChange={(e) => upd('city', e.target.value)} className={INPUT} placeholder="City" />
          </Field>
          <Field label="State">
            <input value={form.state} maxLength={2}
              onChange={(e) => upd('state', e.target.value.toUpperCase())}
              className={INPUT} placeholder="TX" />
          </Field>
          <Field label="Zip">
            <input value={form.zip} onChange={(e) => upd('zip', e.target.value)} className={INPUT} placeholder="78701" />
          </Field>
        </div>
      </Section>

      {/* ── Insertion Order ── */}
      <Section title="Insertion Order">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Size</div>
            {AD_SIZES.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <input type="radio" name="ag_size" value={s} checked={form.ad_size === s}
                  onChange={() => { upd('ad_size', s); onSizeFrChange(s, form.frequency); }}
                  className="w-4 h-4 accent-blue-600" />
                {s}
              </label>
            ))}
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Frequency</div>
            {FREQUENCIES.map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
                <input type="radio" name="ag_freq" value={f} checked={form.frequency === f}
                  onChange={() => { upd('frequency', f); onSizeFrChange(form.ad_size, f); }}
                  className="w-4 h-4 accent-blue-600" />
                {f} {FREQ_PKG_AG[f] ? `· ${FREQ_PKG_AG[f]}` : ''}
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-1">Ad Rate ($)</div>
            {form.payment_type === 'Credit Card' ? (
              <>
                <input value={form.ad_rate} className={INPUT_READONLY} readOnly />
                <div className="text-[10px] text-amber-600 mt-1">
                  +3% CC surcharge (base: ${form.ad_rate_base})
                </div>
              </>
            ) : (
              <input
                type="number"
                value={form.ad_rate}
                onChange={(e) => {
                  upd('ad_rate', e.target.value);
                  upd('ad_rate_base', e.target.value);
                  upd('rate_user_edited', true);
                }}
                className={INPUT}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            )}
            {!form.rate_user_edited && form.ad_rate && (
              <div className="text-[10px] text-gray-400 mt-1">
                ✨ Auto-filled from {FREQ_PKG_AG[form.frequency] ?? form.frequency}
              </div>
            )}
          </div>
          <Field label="Discount ($)">
            <input type="number" value={form.discount}
              onChange={(e) => upd('discount', e.target.value)}
              className={INPUT} placeholder="0.00" min="0" step="0.01" />
          </Field>
          <div>
            <div className="text-xs text-gray-600 mb-1">Ad Premium ($)</div>
            {form.pos_premium_active ? (
              <>
                <input value={form.ad_premium} className={INPUT_READONLY} readOnly />
                <div className="text-[10px] text-gray-400 mt-1">20% page position premium applied</div>
              </>
            ) : (
              <input type="number" value={form.ad_premium}
                onChange={(e) => upd('ad_premium', e.target.value)}
                className={INPUT} placeholder="0.00" min="0" step="0.01" />
            )}
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1">Total Monthly ($)</div>
            <div className="px-3 py-2 rounded border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900">
              ${totalMonthly.toFixed(2)}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">Rate − Discount + Premium</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Page Position">
            <input value={form.page_position}
              onChange={(e) => upd('page_position', e.target.value)}
              className={INPUT} placeholder="e.g. Inside front cover" />
          </Field>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.pos_premium_active}
                onChange={(e) => onTogglePosPremium(e.target.checked)}
                className="w-4 h-4 accent-blue-600" />
              Apply 20% premium
            </label>
          </div>
        </div>

        {/* Ad Timing grid */}
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Ad Timing Term</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-3 bg-gray-50 border border-gray-200 rounded">
            {MONTHS_LIST.map((m) => (
              <div key={m.k} className="flex items-center gap-2">
                <input type="checkbox" id={`agm_${m.k}`}
                  checked={!!form.ad_timing_months[m.k]}
                  onChange={(e) => upd('ad_timing_months', { ...form.ad_timing_months, [m.k]: e.target.checked })}
                  className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0" />
                <label htmlFor={`agm_${m.k}`} className="text-sm min-w-[80px] cursor-pointer">{m.l}</label>
                <input
                  id={`agmy_${m.k}`}
                  value={form.ad_timing_years[m.k] ?? ''}
                  disabled={!form.ad_timing_months[m.k]}
                  maxLength={4}
                  onChange={(e) => upd('ad_timing_years', { ...form.ad_timing_years, [m.k]: e.target.value })}
                  className="w-14 px-2 py-1 text-xs rounded border border-gray-300 disabled:bg-gray-100 disabled:text-gray-400"
                  placeholder="Year"
                />
              </div>
            ))}
          </div>
          {expPreview && (
            <div className="mt-2 text-xs text-gray-600">
              Expiration: <span className="font-medium text-gray-900">{humanDate(expPreview)}</span>
              {remindPreview && <> · Renewal reminder 30 days before: <span className="font-medium">{humanDate(remindPreview)}</span></>}
            </div>
          )}
        </div>
      </Section>

      {/* ── Billing Information ── */}
      <Section title="Billing Information">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Bill To</div>
          {BILL_TO.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="radio" name="ag_bill_to" value={b} checked={form.bill_to === b}
                onChange={() => upd('bill_to', b)}
                className="w-4 h-4 accent-blue-600" />
              {b}
            </label>
          ))}
        </div>
        <Field label="Billing Email *">
          <input value={form.billing_email} type="email"
            onChange={(e) => upd('billing_email', e.target.value)}
            className={INPUT} placeholder="billing@company.com" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing Contact Name">
            <input value={form.billing_contact_name}
              onChange={(e) => upd('billing_contact_name', e.target.value)}
              className={INPUT} />
          </Field>
          <Field label="Billing Contact Phone">
            <input value={form.billing_contact_phone}
              onChange={(e) => upd('billing_contact_phone', formatPhone(e.target.value))}
              className={INPUT} placeholder="555-000-0000" />
          </Field>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Payment Type</div>
          {PAYMENT_TYPES.map((pt) => (
            <label key={pt} className="flex items-center gap-2 text-sm cursor-pointer mb-2">
              <input type="radio" name="ag_pay_type" value={pt} checked={form.payment_type === pt}
                onChange={() => onPayTypeChange(pt)}
                className="w-4 h-4 accent-blue-600" />
              {pt}
            </label>
          ))}
        </div>

        {form.payment_type === 'Credit Card' && (
          <div className="rounded border border-amber-200 bg-amber-50/40 p-3 space-y-3">
            <div className="text-xs text-amber-700 font-medium">A 3% surcharge applies to credit card transactions</div>
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Card Type</div>
              {CARD_TYPES.map((ct) => (
                <label key={ct} className="flex items-center gap-2 text-sm cursor-pointer mb-1">
                  <input type="radio" name="ag_card_type" value={ct} checked={form.card_type === ct}
                    onChange={() => upd('card_type', ct)}
                    className="w-4 h-4 accent-blue-600" />
                  {ct}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cardholder Name">
                <input value={form.cardholder_name}
                  onChange={(e) => upd('cardholder_name', e.target.value)}
                  className={INPUT} />
              </Field>
              <Field label="Card Number (last 4)">
                <input value={form.card_number_last4} maxLength={4} inputMode="numeric"
                  onChange={(e) => upd('card_number_last4', e.target.value.replace(/\D/g, ''))}
                  className={INPUT} placeholder="1234" />
              </Field>
              <Field label="Expiration MM/YY">
                <input value={form.card_expiration} maxLength={5}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^\d/]/g, '');
                    if (v.length === 2 && !v.includes('/') && e.target.value.length > form.card_expiration.length) v += '/';
                    upd('card_expiration', v);
                  }}
                  className={INPUT} placeholder="MM/YY" />
              </Field>
              <Field label="Cardholder Address">
                <input value={form.cardholder_address}
                  onChange={(e) => upd('cardholder_address', e.target.value)}
                  className={INPUT} />
              </Field>
            </div>
          </div>
        )}
      </Section>

      {/* ── Terms & Digital Signature (hidden when uploaded) ── */}
      {!isUploaded && (
        <Section title="Terms &amp; Digital Signature">
          <div className="max-h-40 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
            {TERMS_RL}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-2">
            <input type="checkbox" checked={form.terms_accepted}
              onChange={(e) => upd('terms_accepted', e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            I have read and accept the terms above
          </label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Signing Date">
              <input type="date" value={form.sign_date}
                onChange={(e) => upd('sign_date', e.target.value)}
                className={INPUT} />
            </Field>
          </div>
          <div className={`rounded border-2 p-3 space-y-1 mt-1 ${form.terms_accepted ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'}`}>
            <div className="text-xs text-gray-600 font-medium">Type your full legal name to sign</div>
            <input value={form.signer_name}
              onChange={(e) => upd('signer_name', e.target.value)}
              className={INPUT} placeholder="Full legal name" />
          </div>
        </Section>
      )}

      {/* ── Internal Notes ── */}
      <Section title="Internal Notes">
        <textarea value={form.notes}
          onChange={(e) => upd('notes', e.target.value)}
          rows={3} className={INPUT + ' resize-y'} />
      </Section>

      {/* ── Attachments ── */}
      <Section title="Attachments">
        {/* Existing files */}
        {(existing?.attachments?.files ?? []).length > 0 && (
          <div className="space-y-1">
            {existing!.attachments!.files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-700">
                <svg className="w-3 h-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">{f.name}</a>
                <span className="text-gray-400">({Math.round(f.size / 1024)}KB)</span>
              </div>
            ))}
          </div>
        )}
        {/* Pending new files */}
        {form.pendingFiles.length > 0 && (
          <div className="space-y-1">
            {form.pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                <svg className="w-3 h-3 text-amber-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd"/></svg>
                <span>{f.name}</span>
                <span className="text-gray-400">— pending upload</span>
                <button className="text-rose-500 hover:underline" onClick={() => upd('pendingFiles', form.pendingFiles.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
        )}
        {/* Drop zone */}
        <div
          ref={dropRef}
          className="border-2 border-dashed border-gray-300 rounded p-4 text-center text-xs text-gray-500 cursor-pointer hover:border-blue-400"
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.multiple = true;
            inp.onchange = () => {
              if (inp.files) upd('pendingFiles', [...form.pendingFiles, ...Array.from(inp.files)]);
            };
            inp.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            upd('pendingFiles', [...form.pendingFiles, ...files]);
          }}
        >
          Click or drag files here to attach
        </div>
      </Section>

      {/* ── Legacy fields (Advertiser link, Type, payment mode, campaign) ── */}
      <Section title="System fields">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Linked advertiser">
            <select value={form.advertiser_id ?? ''} onChange={(e) => upd('advertiser_id', e.target.value ? +e.target.value : null)} className={INPUT}>
              <option value="">— none —</option>
              {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.publication}</option>)}
            </select>
          </Field>
          <Field label="Agreement type">
            <select value={form.type ?? ''} onChange={(e) => upd('type', (e.target.value || null) as AgreementType | null)} className={INPUT}>
              <option value="">—</option>
              {AG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => upd('status', e.target.value as AgreementStatus)} className={INPUT}>
              {AG_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Payment mode">
            <select value={form.payment_mode ?? ''} onChange={(e) => upd('payment_mode', (e.target.value || null) as PaymentMode | null)} className={INPUT}>
              <option value="">—</option>
              {PAY_MODES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Linked ad campaign">
          <select value={form.ad_campaign_id} onChange={(e) => upd('ad_campaign_id', e.target.value)} className={INPUT}>
            <option value="">— none —</option>
            {campaignChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.advertiser_name} · {c.ad_space_slug} · {c.publication}
                {' '}({formatDateISO(c.start_date)} → {formatDateISO(c.end_date)})
                {c.active ? '' : ' · inactive'}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* ── Footer ── */}
      {signingMsg && (
        <div className="sticky bottom-[72px] -mx-6 px-6 py-2 bg-indigo-50 border-t border-indigo-200 text-xs text-indigo-800">
          {signingMsg}
        </div>
      )}
      <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center gap-2 flex-wrap">
        {/* Delete — existing only */}
        {!isCreate && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-2 rounded border border-rose-300 text-rose-700 text-sm hover:bg-rose-50 disabled:opacity-50"
          >
            Delete
          </button>
        )}
        {!isCreate && (
          <a
            href={`/api/admin/agreements/${existing!.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50"
          >
            Download PDF
          </a>
        )}
        <div className="flex-1" />
        <button onClick={onClose} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => save(false)}
          disabled={saving}
          className="px-4 py-2 rounded border border-blue-300 text-blue-700 text-sm hover:bg-blue-50 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save as Draft'}
        </button>
        {!isUploaded && (
          <>
            <button
              onClick={sendSigningLink}
              disabled={saving}
              className="px-4 py-2 rounded border border-indigo-300 text-indigo-700 text-sm hover:bg-indigo-50 disabled:opacity-50"
            >
              Send Signing Link
            </button>
            <button
              onClick={copySigningLink}
              disabled={saving}
              className="px-4 py-2 rounded border border-indigo-300 text-indigo-700 text-sm hover:bg-indigo-50 disabled:opacity-50"
              title="Copy signing link to clipboard"
            >
              Copy Link
            </button>
          </>
        )}
        <button
          onClick={() => save(true)}
          disabled={saving || !canSign}
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!canSign ? 'Accept terms, enter signer name and sign date first' : ''}
        >
          {saving ? 'Saving…' : 'Sign & Save'}
        </button>
      </div>
    </DrawerShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Invoice drawer (unchanged, kept intact)
// ──────────────────────────────────────────────────────────────────
function InvoiceDrawer({
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

  const [form, setForm] = useState({
    advertiser_id: initialAdvertiserId as number | null,
    agreement_id: initialAgreementId,
    status: (existing?.status ?? 'draft') as InvoiceStatus,
    amount_dollars: initialAmountDollars,
    tax_dollars: existing?.tax_cents != null ? (existing.tax_cents / 100).toString() : '0',
    due_date: existing?.due_date ? formatDateISO(existing.due_date as string | Date) : '',
    memo: existing?.memo ?? (seed ? 'Generated from agreement' : ''),
    line_items: existing?.line_items ?? [] as InvoiceLineItem[],
  });
  const [saving, setSaving] = useState(false);
  const isCreate = !existing;

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
    if (isCreate && !form.advertiser_id) { onError('advertiser required'); return; }
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
          <Field label="Advertiser">
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

// ──────────────────────────────────────────────────────────────────
// Shared drawer scaffolding
// ──────────────────────────────────────────────────────────────────
function DrawerShell({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">Billing</div>
            <h2 className="text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>{title}</h2>
            {subtitle && <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>
        <div className="p-6 space-y-6">{children}</div>
      </div>
    </div>
  );
}

function DrawerFooter({ saving, onCancel, onSubmit, submitLabel }: { saving: boolean; onCancel: () => void; onSubmit: () => void; submitLabel: string }) {
  return (
    <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-end gap-2">
      <button onClick={onCancel} className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
      <button onClick={onSubmit} disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : submitLabel}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}
