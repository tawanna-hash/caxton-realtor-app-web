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

import { Kpi } from '@/app/admin/billing/_components/Badges';
import { AG_STATUS } from '@/app/admin/billing/_components/constants';
import { getDaysUntil } from '@/app/admin/billing/_components/helpers';
import { AgreementList } from '@/app/admin/billing/_components/AgreementList';
import { RenewalsPanel } from '@/app/admin/billing/_components/RenewalsPanel';
import { AgreementDrawer } from '@/app/admin/billing/_components/AgreementDrawer';
import PageTitle from '@/components/ui/PageTitle';
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
};

type Props = {
  initialAgreements: AgreementWithAdvertiser[];
  initialInvoicesLite: InvoiceLite[];
  advertisers: AdvertiserOption[];
  adCampaigns: AdCampaignOption[];
  initialRenewalReminders: RenewalReminder[];
};

export default function AgreementsClient({
  initialAgreements,
  initialInvoicesLite,
  advertisers,
  adCampaigns: initialAdCampaigns,
  initialRenewalReminders,
}: Props) {
  const [tab, setTab] = useState<'agreements' | 'renewals'>('agreements');
  const [agreements, setAgreements] = useState(initialAgreements);
  const [invoicesLite] = useState(initialInvoicesLite);
  const [adCampaigns, setAdCampaigns] = useState(initialAdCampaigns);
  const [reminders, setReminders] = useState<RenewalReminder[]>(initialRenewalReminders);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createAg, setCreateAg] = useState(false);
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
    const res = await fetch('/api/admin/agreements', { cache: 'no-store' });
    if (res.status === 401) { router.push('/admin/login'); return; }
    if (res.ok) setAgreements((await res.json()).agreements ?? []);
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
    const t = new Date();
    const startOfMonth = new Date(t.getFullYear(), t.getMonth(), 1).getTime();
    let mtd = 0, ar = 0, overdue = 0, expiringCount = 0;
    for (const i of invoicesLite) {
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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Admin · Agreements</div>
          <PageTitle size="md">Agreements</PageTitle>
          <p className="text-sm text-gray-600 mt-1">Contracts and renewals for every advertiser. Stripe charges land via the public Sign Wizard &mdash; see each agreement for payment status.</p>
        </div>
        <div className="flex gap-2">
          {tab === 'renewals'
            ? <button onClick={() => setTab('agreements')} className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">All agreements &rarr;</button>
            : <>
                <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleUploadFile(f); } e.target.value = ''; }}
                />
                <button onClick={handleUploadClick} className="px-4 py-2 rounded border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">&uarr; Upload</button>
                <button onClick={() => setCreateAg(true)} className="px-4 py-2 rounded bg-blue-600 text-white text-sm hover:bg-blue-700">+ New agreement</button>
              </>
          }
        </div>
      </div>

      {/* Recently-signed banner (last 24h) */}
      {!signedBannerDismissed && recentlySigned.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
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
            className="flex-shrink-0 text-emerald-700 hover:text-emerald-900 text-sm px-2 py-1 rounded hover:bg-emerald-100"
            aria-label="Dismiss notification"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Money summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Revenue MTD" value={formatCents(moneySummary.mtd)} accent="emerald" />
        <Kpi label="AR outstanding" value={formatCents(moneySummary.ar)} accent="blue" />
        <Kpi label="Overdue" value={formatCents(moneySummary.overdue)} accent="rose" />
        <Kpi
          label="Expiring 30d"
          value={String(moneySummary.expiringCount)}
          accent="amber"
          onClick={() => setTab('renewals')}
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
            <Kpi label="Signed" value={String(kpis.signedAg)} />
            <Kpi label="Expired" value={String(kpis.expiredAg)} />
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
        {(['agreements', 'renewals'] as const).map((t) => {
          const label = t === 'agreements' ? 'Agreements' : 'Renewals';
          const count = t === 'agreements' ? agreements.length : expiringSoon.length;
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

      {/* Filters */}
      {tab === 'agreements' && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-wrap gap-2 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search advertiser, ad size&hellip;"
            className="flex-1 min-w-[240px] px-3 py-2 rounded border border-gray-300 text-sm"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded border border-gray-300 text-sm">
            <option value="all">All statuses</option>
            {AG_STATUS.map((s) => (
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

      {/* Drawers */}
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
