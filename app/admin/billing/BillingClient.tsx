'use client';

// app/admin/billing/BillingClient.tsx
//
// Tabbed billing workspace. Agreements + Invoices. Each tab is a
// filterable list with a "+ New" affordance that opens the matching
// create drawer. Click any row to open an edit drawer (uses simple
// inline edit modal pattern matching CrmClient).

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  AgreementWithAdvertiser, AgreementStatus, AgreementType, PaymentMode,
} from '@/lib/agreements';
import type {
  InvoiceWithAdvertiser, InvoiceStatus, InvoiceLineItem,
} from '@/lib/invoices';
import { formatCents, lineItemsTotal } from '@/lib/invoices';

type AdvertiserOption = { id: number; name: string; publication: string };

export type AdCampaignOption = {
  id: string;
  advertiser_name: string;
  ad_space_slug: string;
  publication: string;
  // start_date / end_date may arrive as ISO strings (via the API roundtrip) OR
  // as JS Date objects (via the server-component direct SQL query — the neon
  // driver hydrates DATE columns into Date instances). Be tolerant of both.
  start_date: string | Date | null;
  end_date: string | Date | null;
  active: boolean;
  advertiser_id: number | null;
  agreement_id: string | null;
};

/** Format a DATE column value (which may be a JS Date or ISO string) as YYYY-MM-DD. */
function formatDateISO(d: string | Date | null | undefined): string {
  if (d == null) return '—';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  if (typeof d === 'string') return d.length >= 10 ? d.slice(0, 10) : d;
  return String(d);
}

type Props = {
  initialAgreements: AgreementWithAdvertiser[];
  initialInvoices: InvoiceWithAdvertiser[];
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
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

export default function BillingClient({ initialAgreements, initialInvoices, advertisers, adCampaigns: initialAdCampaigns }: Props) {
  const [tab, setTab] = useState<'agreements' | 'invoices' | 'renewals'>('agreements');
  const [agreements, setAgreements] = useState(initialAgreements);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [adCampaigns, setAdCampaigns] = useState(initialAdCampaigns);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createAg, setCreateAg] = useState(false);
  const [createInv, setCreateInv] = useState(false);
  const [editAg, setEditAg] = useState<AgreementWithAdvertiser | null>(null);
  const [editInv, setEditInv] = useState<InvoiceWithAdvertiser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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
      // The campaigns endpoint returns AdCampaignWithRefs — extract subset.
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

  // State: when a user clicks "Generate invoice" on an agreement, we open the
  // InvoiceDrawer pre-populated from that agreement. This object holds the
  // seed values without persisting to the agreement edit state.
  const [invoiceSeed, setInvoiceSeed] = useState<{
    advertiser_id: number | null;
    agreement_id: string;
    amount_cents: number | null;
  } | null>(null);

  // State: when a user clicks "Renew" on an expiring agreement, we open the
  // AgreementDrawer in create mode pre-populated from the source agreement.
  const [renewalSeed, setRenewalSeed] = useState<AgreementWithAdvertiser | null>(null);

  // Renewal-tab derived list — only agreements that need attention OR have
  // a notice on file. Sorted by soonest-expiring first.
  const renewalRows = useMemo(() => {
    return agreements
      .filter((a) => a.end_date && a.status !== 'cancelled')
      .map((a) => ({ a, info: renewalInfoFor(a) }))
      .filter(({ info }) => info.bucket !== 'fresh')
      .sort((x, y) => {
        const dx = x.info.daysUntilExpiry ?? 99999;
        const dy = y.info.daysUntilExpiry ?? 99999;
        return dx - dy;
      })
      .map(({ a }) => a);
  }, [agreements]);

  const renewalKpis = useMemo(() => {
    let expired = 0, dueSoon = 0, upcoming = 0, noticesSent = 0;
    for (const a of agreements) {
      const info = renewalInfoFor(a);
      if (a.status === 'cancelled') continue;
      if (info.bucket === 'expired') expired++;
      else if (info.bucket === 'due_soon') dueSoon++;
      else if (info.bucket === 'upcoming') upcoming++;
      if (info.noticeSent) noticesSent++;
    }
    return { expired, dueSoon, upcoming, noticesSent };
  }, [agreements]);

  const markNoticeSent = useCallback(async (ag: AgreementWithAdvertiser) => {
    try {
      const res = await fetch(`/api/admin/agreements/${ag.id}/mark-notice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await reloadAgreements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'mark notice failed');
    }
  }, [reloadAgreements, router]);

  // Filter
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

  // KPIs
  const kpis = useMemo(() => {
    const activeAg = agreements.filter((a) => a.status === 'active').length;
    const draftAg  = agreements.filter((a) => a.status === 'draft').length;
    const outstanding = invoices
      .filter((i) => i.status !== 'paid' && i.status !== 'void')
      .reduce((s, i) => s + (i.total_cents ?? 0), 0);
    // Date.now() is a snapshot read for a 30-day cutoff. The KPI memo is
    // recomputed when invoices change — staleness here is acceptable.
    // eslint-disable-next-line react-hooks/purity
    const cutoff = Date.now() - 30 * 86400000;
    const paid30 = invoices
      .filter((i) => i.status === 'paid' && i.paid_at && new Date(i.paid_at).getTime() > cutoff)
      .reduce((s, i) => s + (i.total_cents ?? 0), 0);
    return { activeAg, draftAg, outstanding, paid30 };
  }, [agreements, invoices]);

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
              : <button onClick={() => setCreateAg(true)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">+ New agreement</button>}
        </div>
      </div>

      {/* KPIs — swap based on active tab */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tab === 'renewals' ? (
          <>
            <Kpi label="Expired" value={String(renewalKpis.expired)} />
            <Kpi label="Due in 30d" value={String(renewalKpis.dueSoon)} />
            <Kpi label="Upcoming (90d)" value={String(renewalKpis.upcoming)} />
            <Kpi label="Notices sent" value={String(renewalKpis.noticesSent)} />
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

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['agreements','invoices','renewals'] as const).map((t) => {
          const label = t === 'agreements' ? 'Agreements' : t === 'invoices' ? 'Invoices' : 'Renewals';
          const count = t === 'agreements' ? agreements.length
                      : t === 'invoices' ? invoices.length
                      : renewalRows.length;
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

      {/* Filters — hidden on renewals tab (renewals are pre-sorted/filtered) */}
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
        <AgreementList rows={filteredAg} onOpen={(r) => setEditAg(r)} />
      ) : tab === 'invoices' ? (
        <InvoiceList rows={filteredInv} onOpen={(r) => setEditInv(r)} />
      ) : (
        <RenewalList
          rows={renewalRows}
          onOpen={(r) => setEditAg(r)}
          onMarkNotice={markNoticeSent}
          onRenew={(r) => setRenewalSeed(r)}
        />
      )}

      {/* New Agreement / Invoice CTA also depends on tab */}
      {/* (rendered inside the header block above) */}

      {/* Modals */}
      {createAg && (
        <AgreementDrawer
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setCreateAg(false)}
          onSaved={async () => { setCreateAg(false); await reloadAgreements(); await reloadAdCampaigns(); }}
          onError={setError}
        />
      )}

      {renewalSeed && (
        <AgreementDrawer
          renewedFrom={renewalSeed}
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setRenewalSeed(null)}
          onSaved={async () => { setRenewalSeed(null); await reloadAgreements(); await reloadAdCampaigns(); }}
          onError={setError}
        />
      )}
      {editAg && (
        <AgreementDrawer
          existing={editAg}
          advertisers={advertisers}
          adCampaigns={adCampaigns}
          onClose={() => setEditAg(null)}
          onSaved={async () => { setEditAg(null); await reloadAgreements(); await reloadAdCampaigns(); }}
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
// KPIs + lists
// ──────────────────────────────────────────────────────────────────
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{label}</div>
      <div className="text-2xl text-gray-900 mt-1" style={{ fontFamily: 'Georgia, serif' }}>{value}</div>
    </div>
  );
}

function StatusPill({ value, options }: { value: string; options: { value: string; label: string; tone: string }[] }) {
  const opt = options.find((o) => o.value === value) ?? options[0];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${opt.tone}`}>{opt.label}</span>;
}

function AgreementList({ rows, onOpen }: { rows: AgreementWithAdvertiser[]; onOpen: (r: AgreementWithAdvertiser) => void }) {
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
        <div className="col-span-2">Status</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <button key={r.id} onClick={() => onOpen(r)} className="w-full grid grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-blue-50/40">
            <div className="col-span-3 min-w-0">
              <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? r.company_name ?? '—'}</div>
              <div className="text-xs text-gray-500 truncate">{r.rep_name ?? r.advertiser_email ?? ''}</div>
            </div>
            <div className="col-span-2 text-sm text-gray-700">
              <div>{AG_TYPES.find((t) => t.value === r.type)?.label ?? r.type ?? '—'}</div>
              <div className="text-xs text-gray-500">{r.ad_size ?? ''} {r.frequency ? `· ${r.frequency}` : ''}</div>
            </div>
            <div className="col-span-2 text-sm text-gray-700">
              {r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
              {' → '}
              {r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}
            </div>
            <div className="col-span-2 text-sm text-gray-900">{formatCents(r.amount_cents)}</div>
            <div className="col-span-1 text-sm text-gray-700">{formatCents(r.invoiced_cents)}</div>
            <div className="col-span-2"><StatusPill value={r.status} options={AG_STATUS} /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Renewals — derived view over agreements
// ──────────────────────────────────────────────────────────────────
export type RenewalBucket = 'expired' | 'due_soon' | 'upcoming' | 'fresh';

export function renewalInfoFor(ag: AgreementWithAdvertiser): {
  bucket: RenewalBucket;
  daysUntilExpiry: number | null;
  noticeSent: boolean;
} {
  const noticeSent = !!ag.renewal_notice_date;
  if (!ag.end_date) return { bucket: 'fresh', daysUntilExpiry: null, noticeSent };
  const end = new Date(ag.end_date as unknown as string);
  const today = new Date();
  // Normalise to UTC midnight for stable date math.
  end.setUTCHours(0, 0, 0, 0);
  today.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  let bucket: RenewalBucket;
  if (diffDays < 0) bucket = 'expired';
  else if (diffDays <= 30) bucket = 'due_soon';
  else if (diffDays <= 90) bucket = 'upcoming';
  else bucket = 'fresh';
  return { bucket, daysUntilExpiry: diffDays, noticeSent };
}

function RenewalBadge({ bucket, days }: { bucket: RenewalBucket; days: number | null }) {
  const cfg: Record<RenewalBucket, { label: string; cls: string }> = {
    expired:  { label: days != null ? `Expired ${Math.abs(days)}d ago` : 'Expired', cls: 'border-rose-500 text-rose-700 bg-rose-50' },
    due_soon: { label: days != null ? `Due in ${days}d` : 'Due soon',                cls: 'border-amber-500 text-amber-700 bg-amber-50' },
    upcoming: { label: days != null ? `${days}d out` : 'Upcoming',                   cls: 'border-sky-400 text-sky-700 bg-sky-50' },
    fresh:    { label: 'Fresh',                                                       cls: 'border-gray-300 text-gray-600 bg-gray-50' },
  };
  const { label, cls } = cfg[bucket];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-[0.15em] border ${cls}`}>
      {label}
    </span>
  );
}

function RenewalList({
  rows, onOpen, onMarkNotice, onRenew,
}: {
  rows: AgreementWithAdvertiser[];
  onOpen: (r: AgreementWithAdvertiser) => void;
  onMarkNotice: (r: AgreementWithAdvertiser) => Promise<void>;
  onRenew: (r: AgreementWithAdvertiser) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No agreements need renewal attention.</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">End date</div>
        <div className="col-span-2">Renewal</div>
        <div className="col-span-2">Notice</div>
        <div className="col-span-1">Amount</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const info = renewalInfoFor(r);
          return (
            <div key={r.id} className="w-full grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-blue-50/40">
              <button onClick={() => onOpen(r)} className="col-span-3 min-w-0 text-left">
                <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? r.company_name ?? '—'}</div>
                <div className="text-xs text-gray-500 truncate">{r.rep_name ?? r.advertiser_email ?? ''}</div>
              </button>
              <div className="col-span-2 text-sm text-gray-700">
                {r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}
              </div>
              <div className="col-span-2">
                <RenewalBadge bucket={info.bucket} days={info.daysUntilExpiry} />
              </div>
              <div className="col-span-2 text-xs text-gray-700">
                {info.noticeSent
                  ? <span className="inline-flex items-center gap-1 text-emerald-700">
                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L9 11.6l6.3-6.3a1 1 0 011.4 0z" clipRule="evenodd"/></svg>
                      Sent {r.renewal_notice_date ? new Date(r.renewal_notice_date).toLocaleDateString() : ''}
                    </span>
                  : <span className="text-gray-400">—</span>}
              </div>
              <div className="col-span-1 text-sm text-gray-900">{formatCents(r.amount_cents)}</div>
              <div className="col-span-2 flex gap-1 justify-end">
                {!info.noticeSent && (
                  <button
                    type="button"
                    onClick={() => onMarkNotice(r)}
                    className="px-2 py-1 rounded text-xs border border-gray-300 text-gray-700 hover:bg-gray-50"
                    title="Mark renewal notice as sent today"
                  >
                    Mark notice
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRenew(r)}
                  className="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
                  title="Create a new draft agreement based on this one"
                >
                  Renew
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
// Agreement drawer (create + edit)
// ──────────────────────────────────────────────────────────────────
const INPUT = 'w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function AgreementDrawer({
  existing, renewedFrom, advertisers, adCampaigns, onClose, onSaved, onError, onGenerateInvoice,
}: {
  existing?: AgreementWithAdvertiser;
  /**
   * When set, opens the drawer in CREATE mode but pre-populates fields from
   * the source agreement. Used by the Renewals tab to draft a follow-on
   * agreement: new term starts where the old one ends, +12 months by default.
   */
  renewedFrom?: AgreementWithAdvertiser;
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (msg: string) => void;
  onGenerateInvoice?: (seed: { advertiser_id: number | null; agreement_id: string; amount_cents: number | null }) => void;
}) {
  // Determine which campaign is currently linked to this agreement (one-to-one).
  const linkedCampaign = useMemo(
    () => existing ? (adCampaigns.find((c) => c.agreement_id === existing.id) ?? null) : null,
    [adCampaigns, existing],
  );

  // Renewal seed — compute default start/end for the new draft.
  const renewalDefaults = useMemo(() => {
    if (!renewedFrom) return null;
    const oldEnd = renewedFrom.end_date ? new Date(renewedFrom.end_date as unknown as string) : new Date();
    oldEnd.setUTCHours(0, 0, 0, 0);
    // New term starts the day after the old one ends.
    const newStart = new Date(oldEnd.getTime() + 86_400_000);
    const newEnd = new Date(newStart.getTime());
    newEnd.setUTCFullYear(newEnd.getUTCFullYear() + 1);
    return {
      start_date: newStart.toISOString().slice(0, 10),
      end_date: newEnd.toISOString().slice(0, 10),
    };
  }, [renewedFrom]);

  // Effective seed: explicit edit > renewal > blank.
  const seed: AgreementWithAdvertiser | undefined = existing ?? renewedFrom;

  const [form, setForm] = useState({
    advertiser_id: seed?.advertiser_id ?? null as number | null,
    type: (seed?.type ?? null) as AgreementType | null,
    status: (existing?.status ?? 'draft') as AgreementStatus,
    start_date: renewalDefaults?.start_date
      ?? (existing?.start_date ? formatDateISO(existing.start_date as string | Date) : ''),
    end_date: renewalDefaults?.end_date
      ?? (existing?.end_date ? formatDateISO(existing.end_date as string | Date) : ''),
    ad_size: seed?.ad_size ?? '',
    frequency: seed?.frequency ?? '',
    ad_rate_dollars: seed?.ad_rate_cents != null ? (seed.ad_rate_cents / 100).toString() : '',
    amount_dollars: seed?.amount_cents != null ? (seed.amount_cents / 100).toString() : '',
    payment_mode: (seed?.payment_mode ?? null) as PaymentMode | null,
    notes: existing?.notes
      ?? (renewedFrom ? `Renewed from agreement ${renewedFrom.id}` : ''),
    rep_name: seed?.rep_name ?? '',
    ad_campaign_id: (linkedCampaign?.id ?? '') as string,
  });
  const [saving, setSaving] = useState(false);
  const isCreate = !existing;

  // For new agreements, show ALL campaigns (filtered later). For existing,
  // include the currently-linked campaign plus any unlinked ones.
  const campaignChoices = useMemo(() => {
    const eligible = adCampaigns.filter((c) =>
      c.agreement_id === null
      || (existing && c.agreement_id === existing.id),
    );
    // Optional: prefer campaigns whose advertiser matches the selected advertiser.
    if (form.advertiser_id) {
      const own = eligible.filter((c) => c.advertiser_id === form.advertiser_id);
      const rest = eligible.filter((c) => c.advertiser_id !== form.advertiser_id);
      return [...own, ...rest];
    }
    return eligible;
  }, [adCampaigns, existing, form.advertiser_id]);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (isCreate && !form.advertiser_id) { onError('advertiser required'); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        advertiser_id: form.advertiser_id,
        type: form.type || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        ad_size: form.ad_size || null,
        frequency: form.frequency || null,
        ad_rate_cents: form.ad_rate_dollars ? Math.round(parseFloat(form.ad_rate_dollars) * 100) : null,
        amount_cents: form.amount_dollars ? Math.round(parseFloat(form.amount_dollars) * 100) : null,
        payment_mode: form.payment_mode || null,
        rep_name: form.rep_name || null,
        notes: form.notes || null,
      };
      const url = isCreate ? '/api/admin/agreements' : `/api/admin/agreements/${existing.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // After the agreement is saved, sync the ad_campaign link if it changed.
      const saved = await res.json();
      const agreementId = saved.agreement?.id ?? existing?.id;
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

  const handleGenerateInvoice = () => {
    if (!existing || !onGenerateInvoice) return;
    onGenerateInvoice({
      advertiser_id: existing.advertiser_id,
      agreement_id: existing.id,
      amount_cents: existing.amount_cents,
    });
  };

  return (
    <DrawerShell
      title={isCreate
        ? (renewedFrom ? `Renew — ${renewedFrom.advertiser_name ?? 'agreement'}` : 'New agreement')
        : (existing?.advertiser_name ?? 'Agreement')}
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
            onClick={handleGenerateInvoice}
            className="px-3 py-1.5 rounded bg-blue-600 text-white text-xs hover:bg-blue-700"
          >
            Generate invoice
          </button>
        </div>
      )}

      <Section title="Parties">
        <Field label="Advertiser">
          <select value={form.advertiser_id ?? ''} onChange={(e) => update('advertiser_id', e.target.value ? +e.target.value : null)} className={INPUT}>
            <option value="">— select —</option>
            {advertisers.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.publication}</option>)}
          </select>
        </Field>
        <Field label="Rep name (their side)">
          <input value={form.rep_name} onChange={(e) => update('rep_name', e.target.value)} className={INPUT} />
        </Field>
      </Section>

      <Section title="Terms">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.type ?? ''} onChange={(e) => update('type', (e.target.value || null) as AgreementType | null)} className={INPUT}>
              <option value="">—</option>
              {AG_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => update('status', e.target.value as AgreementStatus)} className={INPUT}>
              {AG_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Start date"><input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)} className={INPUT} /></Field>
          <Field label="End date"><input type="date" value={form.end_date} onChange={(e) => update('end_date', e.target.value)} className={INPUT} /></Field>
          <Field label="Ad size"><input value={form.ad_size} onChange={(e) => update('ad_size', e.target.value)} className={INPUT} placeholder="full-page, half, quarter…" /></Field>
          <Field label="Frequency"><input value={form.frequency} onChange={(e) => update('frequency', e.target.value)} className={INPUT} placeholder="monthly, weekly…" /></Field>
        </div>
      </Section>

      <Section title="Money">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ad rate ($/issue)"><input value={form.ad_rate_dollars} onChange={(e) => update('ad_rate_dollars', e.target.value)} className={INPUT} placeholder="800" inputMode="decimal" /></Field>
          <Field label="Total amount ($)"><input value={form.amount_dollars} onChange={(e) => update('amount_dollars', e.target.value)} className={INPUT} placeholder="9600" inputMode="decimal" /></Field>
          <Field label="Payment mode" className="col-span-2">
            <select value={form.payment_mode ?? ''} onChange={(e) => update('payment_mode', (e.target.value || null) as PaymentMode | null)} className={INPUT}>
              <option value="">—</option>
              {PAY_MODES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Linked ad campaign">
        <Field label="Ad campaign">
          <select value={form.ad_campaign_id} onChange={(e) => update('ad_campaign_id', e.target.value)} className={INPUT}>
            <option value="">— none —</option>
            {campaignChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.advertiser_name} · {c.ad_space_slug} · {c.publication}
                {' '}({formatDateISO(c.start_date)} → {formatDateISO(c.end_date)})
                {c.active ? '' : ' · inactive'}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1">
            Link this agreement to a running ad campaign. Only campaigns without an existing
            agreement (plus the one already linked here, if any) are shown.
          </div>
        </Field>
      </Section>

      <Section title="Notes">
        <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} rows={3} className={INPUT + ' resize-y'} />
      </Section>

      <DrawerFooter saving={saving} onCancel={onClose} onSubmit={submit} submitLabel={isCreate ? 'Create' : 'Save changes'} />
    </DrawerShell>
  );
}

// ──────────────────────────────────────────────────────────────────
// Invoice drawer (create + edit)
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
  // When seeded from an agreement, pre-populate advertiser + agreement + amount.
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
