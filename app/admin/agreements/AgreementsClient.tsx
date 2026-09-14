'use client';

// app/admin/agreements/AgreementsClient.tsx
//
// Agreements workspace. Two sub-tabs: Agreements + Renewals. Invoices live
// at /admin/invoices. Shares drawer / list / badge components with the
// invoices page via app/admin/billing/_components/*.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';
import { formatCents } from '@/lib/invoices';

import { AG_STATUS } from '@/app/admin/billing/_components/constants';
import { getDaysUntil } from '@/app/admin/billing/_components/helpers';
import { AgreementList } from '@/app/admin/billing/_components/AgreementList';
import { RenewalsPanel } from '@/app/admin/billing/_components/RenewalsPanel';
import { AgreementDrawer } from '@/app/admin/billing/_components/AgreementDrawer';
import PageTitle from '@/components/ui/PageTitle';
import NewQuoteModal from '@/app/admin/_components/NewQuoteModal';

import type {
  AdvertiserOption,
  AdCampaignOption,
} from '@/app/admin/billing/_components/types';

type InvoiceLite = {
  id: string;
  status: string;
  total_cents: number | null;
  paid_at: string | null;
  due_date: string | null;
  is_overdue: boolean;
  amount_paid_cents: number;
  balance_cents: number;
  paid_mtd_cents: number;
};

type Props = {
  initialAgreements: AgreementWithAdvertiser[];
  initialInvoicesLite: InvoiceLite[];
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  initialRenewalReminders: RenewalReminder[];
};

function SummaryMetric({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="text-lg font-semibold leading-tight text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-600">{label}</div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="min-w-0 px-3 py-1 text-left hover:bg-orange-50">
      {content}
    </button>
  ) : (
    <div className="min-w-0 px-3 py-1">{content}</div>
  );
}

export default function AgreementsClient({
  initialAgreements,
  initialInvoicesLite,
  advertisers,
  adCampaigns: initialAdCampaigns,
  initialRenewalReminders,
}: Props) {
  const [tab, setTab] = useState<'agreements' | 'renewals'>('agreements');
  const agreements = initialAgreements;
  const invoicesLite = initialInvoicesLite;
  const [adCampaigns, setAdCampaigns] = useState(initialAdCampaigns);
  const [reminders, setReminders] = useState<RenewalReminder[]>(initialRenewalReminders);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createAg, setCreateAg] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [editAg, setEditAg] = useState<AgreementWithAdvertiser | null>(null);
  const [renewalSeed, setRenewalSeed] = useState<AgreementWithAdvertiser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recently-signed banner: shows agreements whose signed_at is within the
  // last 24h, dismissable per-browser via localStorage. Server triggers an
  // admin email via lib/server/agreement-signed-notify when /api/sign POST
  // flips an agreement to signed; this is the in-app companion surface.
  //
  // `nowMs` is seeded once at mount (post-mount via useEffect) so the memo
  // stays pure (no Date.now() inside useMemo). It refreshes every 5 min so
  // the 24h window slides without a full page reload.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const recentlySigned = useMemo(() => {
    if (nowMs == null) return [] as AgreementWithAdvertiser[];
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000;
    return agreements.filter((ag) => {
      if (!ag.signed_at) return false;
      const ts = new Date(ag.signed_at).getTime();
      return Number.isFinite(ts) && ts >= cutoffMs;
    });
  }, [agreements, nowMs]);
  // Track the dismissal-key the user has acknowledged in this browser.
  // Banner shows when the current recently-signed id-set differs from this.
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDismissedKey(
      window.localStorage.getItem('agreements:signedBannerDismissedFor'),
    );
  }, []);
  const recentlySignedKey = useMemo(
    () => recentlySigned.map((a) => a.id).sort().join(','),
    [recentlySigned],
  );
  const signedBannerDismissed =
    recentlySignedKey === '' || dismissedKey === recentlySignedKey;
  const dismissSignedBanner = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      'agreements:signedBannerDismissedFor',
      recentlySignedKey,
    );
    setDismissedKey(recentlySignedKey);
  }, [recentlySignedKey]);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const reloadAgreements = useCallback(async () => {
    router.refresh();
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

  const [renewalTab, setRenewalTab] = useState<'expiring' | 'all_renewals' | 'reminders'>('expiring');

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

  const filteredAg = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agreements.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.advertiser_name, a.company_name, a.rep_name, a.advertiser_email, a.notes, a.ad_size, a.frequency]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [agreements, query, statusFilter]);

  // Money summary uses invoices for MTD/AR/overdue + agreements for expiring count.
  const moneySummary = useMemo(() => {
    let mtd = 0, ar = 0, overdue = 0, expiringCount = 0;
    for (const i of invoicesLite) {
      mtd += i.paid_mtd_cents;
      if (i.status !== 'paid' && i.status !== 'void') {
        ar += i.balance_cents;
        if (i.is_overdue) overdue += i.balance_cents;
      }
    }
    for (const a of agreements) {
      if (a.status === 'cancelled' || a.status === 'expired') continue;
      const days = getDaysUntil(a.exp_date ?? a.end_date);
      if (days !== null && days >= 0 && days <= 30) expiringCount++;
    }
    return { mtd, ar, overdue, expiringCount };
  }, [agreements, invoicesLite]);

  const kpis = useMemo(() => {
    const activeAg = agreements.filter((a) => a.status === 'active' || a.status === 'sent').length;
    const draftAg  = agreements.filter((a) => a.status === 'draft').length;
    const signedAg = agreements.filter((a) => a.status === 'signed').length;
    const expiredAg = agreements.filter((a) => a.status === 'expired').length;
    return { activeAg, draftAg, signedAg, expiredAg };
  }, [agreements]);

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
      if (data.agreement) setEditAg(data.agreement as AgreementWithAdvertiser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    }
  }, [reloadAgreements]);

  const totalPages = Math.max(1, Math.ceil(filteredAg.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredAg.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Agreements</div>
          <PageTitle size="md">Agreements</PageTitle>
          <p className="text-sm text-gray-600 mt-1">Contracts and renewals for every partner. Stripe charges land via the public Sign Wizard &mdash; see each agreement for payment status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/ads/orders" className="inline-flex h-9 items-center whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">Ad pipeline &rarr;</a>
          {tab === 'renewals'
            ? <button onClick={() => setTab('agreements')} className="inline-flex h-9 items-center whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">All agreements &rarr;</button>
            : <>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleUploadFile(f); } e.target.value = ''; }}
                />
                <button onClick={handleUploadClick} title="Upload manually signed agreement (pdf, jpeg)" className="inline-flex h-9 items-center whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50">Upload signed</button>
                <button onClick={() => setNewQuoteOpen(true)} className="inline-flex h-9 items-center whitespace-nowrap rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700">New proposal</button>
                <button onClick={() => setCreateAg(true)} className="inline-flex h-9 items-center whitespace-nowrap rounded border border-orange-700 bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700">New agreement</button>
              </>
          }
        </div>
      </div>

      {/* Recently-signed banner (last 24h) */}
      {!signedBannerDismissed && recentlySigned.length > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5 text-emerald-600" aria-hidden>✓</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-emerald-900">
              {recentlySigned.length === 1
                ? '1 agreement signed in the last 24 hours'
                : `${recentlySigned.length} agreements signed in the last 24 hours`}
            </div>
            <ul className="mt-1 text-xs text-emerald-800 space-y-0.5">
              {recentlySigned.slice(0, 5).map((ag) => (
                <li key={ag.id} className="flex items-baseline gap-2">
                  <button
                    type="button"
                    onClick={() => setEditAg(ag)}
                    className="font-medium underline-offset-2 hover:underline text-left"
                  >
                    {ag.company_name || ag.advertiser_name || '(unnamed)'}
                  </button>
                  <span className="text-emerald-700">
                    {ag.signer_name ? `signed by ${ag.signer_name}` : 'signed'}
                  </span>
                </li>
              ))}
              {recentlySigned.length > 5 && (
                <li className="text-emerald-700 italic">+{recentlySigned.length - 5} more</li>
              )}
            </ul>
          </div>
          <button
            type="button"
            onClick={dismissSignedBanner}
            className="flex-shrink-0 text-emerald-700 hover:text-emerald-900 text-sm px-2 py-1 rounded-md hover:bg-emerald-100"
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Money summary strip */}
      <section aria-label="Agreement financial summary" className="grid grid-cols-2 divide-x divide-gray-200 border-y border-gray-200 py-2 md:grid-cols-4">
        <SummaryMetric label="Revenue MTD" value={formatCents(moneySummary.mtd)} />
        <SummaryMetric label="AR outstanding" value={formatCents(moneySummary.ar)} />
        <SummaryMetric label="Overdue" value={formatCents(moneySummary.overdue)} />
        <SummaryMetric
          label="Expiring 30d"
          value={String(moneySummary.expiringCount)}
          onClick={() => setTab('renewals')}
        />
      </section>

      {/* Tab-scoped KPIs */}
      <section aria-label={`${tab} status summary`} className="grid grid-cols-2 divide-x divide-gray-200 md:grid-cols-4">
        {tab === 'renewals' ? (
          <>
            <SummaryMetric label="Overdue" value={String(renewalKpis.overdue)} />
            <SummaryMetric label="Expiring 30d" value={String(renewalKpis.expiring30)} />
            <SummaryMetric label="Renewed this month" value={String(renewalKpis.renewedThisMonth)} />
            <SummaryMetric label="Pending reminders" value={String(renewalKpis.pendingReminders)}
              onClick={() => setRenewalTab('reminders')} />
          </>
        ) : (
          <>
            <SummaryMetric label="Active + sent" value={String(kpis.activeAg)} />
            <SummaryMetric label="Drafts" value={String(kpis.draftAg)} />
            <SummaryMetric label="Signed" value={String(kpis.signedAg)} />
            <SummaryMetric label="Expired" value={String(kpis.expiredAg)} />
          </>
        )}
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800 shadow-lg">
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['agreements', 'renewals'] as const).map((t) => {
          const label = t === 'agreements' ? 'Agreements' : 'Renewals';
          const count = t === 'agreements' ? agreements.length : expiringSoon.length;
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setStatusFilter('all'); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t ? 'border-orange-600 text-orange-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              <span className={`ml-2 text-xs ${tab === t ? 'text-orange-600' : 'text-gray-400'}`}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {tab === 'agreements' && (
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search partner, ad size&hellip;"
            className="h-9 min-w-[240px] flex-1 rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded border border-gray-300 bg-white px-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
            <option value="all">All statuses</option>
            {AG_STATUS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Lists */}
      {tab === 'agreements' ? (
        <>
        <AgreementList
          rows={pageRows}
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
        {filteredAg.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-600">
            <div>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredAg.length)} of {filteredAg.length}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2">
                Rows
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="h-9 rounded border border-gray-300 bg-white px-2 text-xs">
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button type="button" disabled={currentPage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-9 rounded border border-gray-300 bg-white px-3 disabled:opacity-40">Previous</button>
              <span className="tabular-nums">Page {currentPage} of {totalPages}</span>
              <button type="button" disabled={currentPage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-9 rounded border border-gray-300 bg-white px-3 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
        </>
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
          onDeleteReminder={async (r) => {
            const confirmation = window.prompt(
              `Permanently delete the renewal reminder for ${r.rep_name ?? r.company_name ?? 'this client'}?\n\nThis cannot be undone. Type DELETE to confirm.`,
            );
            if (confirmation !== 'DELETE') return;
            try {
              const res = await fetch(`/api/admin/renewal-reminders/${r.id}`, { method: 'DELETE' });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              await reloadReminders();
              showToast('Renewal reminder deleted.');
            } catch (e) { setError(e instanceof Error ? e.message : 'delete reminder failed'); }
          }}
        />
      )}

      {/* Drawers */}
      <NewQuoteModal
        open={newQuoteOpen}
        onClose={() => setNewQuoteOpen(false)}
      />
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
          onRefresh={async () => { await reloadAgreements(); await reloadAdCampaigns(); }}
          onError={setError}
          onGenerateInvoice={(seed) => {
            setEditAg(null);
            // Hand off to /admin/invoices with seed values in query string so
            // the invoice page opens the create drawer pre-populated.
            const params = new URLSearchParams();
            if (seed.advertiser_id !== null) params.set('advertiser_id', String(seed.advertiser_id));
            params.set('agreement_id', seed.agreement_id);
            if (seed.amount_cents !== null) params.set('amount_cents', String(seed.amount_cents));
            params.set('create', '1');
            router.push(`/admin/invoices?${params.toString()}`);
          }}
        />
      )}
    </div>
  );
}
