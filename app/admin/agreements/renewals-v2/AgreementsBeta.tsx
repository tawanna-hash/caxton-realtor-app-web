'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import SentClient from '../proposals/sent/SentClient';
import BuilderList from '../proposals/BuilderList';
import RenewalsV2Client from './RenewalsV2Client';
import NewPartnersPanel from './NewPartnersPanel';
import StatusBoard from './StatusBoard';
import SignedAgreements from './SignedAgreements';
import DefaultsPanel from './DefaultsPanel';
import { A } from '@/components/anchor/ui';

type Tab = 'board' | 'sent' | 'drafts' | 'archived' | 'renewals' | 'defaults';
const TABS: Array<[Tab, string]> = [
  ['board', 'Agreements'],
  ['sent', 'Sent'],
  ['drafts', 'Drafts'],
  ['archived', 'Archived'],
  ['renewals', 'Renewals'],
  ['defaults', 'Default settings'],
];
const SUB: Record<Tab, string> = {
  board: 'Create and send new partner agreements, approve check requests, and track every agreement.',
  sent: 'Agreements sent to partners, with where each one stands.',
  drafts: 'Agreements you started but have not sent.',
  archived: 'Agreements you set aside.',
  renewals: 'One-tap renewals, sent one at a time or as a monthly batch.',
  defaults: 'Set the default values of new agreements you create.',
};

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[color:var(--ds-line)] pb-3 text-left"
        style={{ borderTop: 0, borderLeft: 0, borderRight: 0, background: 'transparent', borderRadius: 0 }}
      >
        <span className="text-base font-semibold text-[color:var(--ds-ink)]">{title}</span>
        <span aria-hidden="true" className="inline-block text-[10px] leading-none">&#9660;</span>
      </button>
      <div className={open ? 'pt-4' : 'hidden'}>{children}</div>
    </section>
  );
}

export default function AgreementsBeta() {
  const want = useSearchParams()?.get('tab') as Tab | null;
  if (typeof window !== 'undefined' && (want as string | null) === 'templates') window.location.replace('/admin/agreements/templates-beta');
  const [counts, setCounts] = useState<Partial<Record<Tab, number>>>({});
  useEffect(() => {
    const get = (u: string) => fetch(u, { credentials: 'include', cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    void Promise.all([get('/api/admin/agreements'), get('/api/admin/agreements-v2/board'), get('/api/admin/agreements-v2/builder'), get('/api/admin/renewals-v2?days=90')]).then(([a, b, d, r]) => {
      const c: Partial<Record<Tab, number>> = {};
      if (a?.agreements) c.board = (a.agreements as Array<{ status?: string; signed_at?: string | null; end_date?: string | null }>).filter((x) => { const t = String(x.status).toLowerCase(); return (t === 'signed' || t === 'active' || !!x.signed_at) && !['cancelled', 'canceled', 'terminated', 'expired'].includes(t) && !(x.end_date && x.end_date.slice(0, 10) < new Date().toISOString().slice(0, 10)); }).length;
      if (b?.items) c.sent = (b.items as Array<{ stage?: string }>).filter((i) => i.stage === 'sent' || i.stage === 'opened').length;
      if (d) { c.drafts = (d.drafts ?? []).length; c.archived = (d.archived ?? []).length; }
      if (r?.candidates) c.renewals = (r.candidates as unknown[]).length;
      setCounts(c);
    });
  }, []);
  const [tab, setTab] = useState<Tab>(want && TABS.some(([k]) => k === want) ? want : 'board');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className={A.title}>Agreements <span className="ml-1 rounded-full border border-[color:var(--ds-primary)] px-2 py-0.5 align-middle text-xs font-medium text-[color:var(--ds-primary)]">Beta</span></h1>
        {tab !== 'board' && <p className={A.subtitle}>{SUB[tab]}</p>}
        </div>
        <div id="agr-actions" className="flex flex-wrap items-center gap-3" />
      </div>
      <div className="flex gap-x-8 overflow-x-auto whitespace-nowrap border-b border-[color:var(--ds-line)]" role="tablist" aria-label="Agreements beta">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`anchor-tab -mb-px border-b-2 pb-3 text-[15px] ${tab === key ? 'border-[color:var(--ds-primary)] font-medium text-[color:var(--ds-ink)]' : 'border-transparent text-[color:var(--ds-body)] hover:text-[color:var(--ds-ink)]'}`}
          >
            {label}{typeof counts[key] === 'number' && <span className="ml-2 rounded-full bg-[#E4E3F1] px-2 py-0.5 align-middle text-[11px] font-medium leading-none text-[color:var(--ds-body)]">{counts[key]}</span>}
          </button>
        ))}
      </div>
      {tab === 'board' && (
        <SignedAgreements />
      )}
      {tab === 'sent' && (
        <div className="space-y-6">
          <SentClient />
          <Collapsible title="Waiting to be signed"><NewPartnersPanel /></Collapsible>
          <Collapsible title="Pipeline: drafts, sent and signed"><StatusBoard /></Collapsible>
        </div>
      )}
      {tab === 'drafts' && <BuilderList kind="draft" />}
      {tab === 'archived' && <BuilderList kind="archived" />}
      {tab === 'renewals' && <RenewalsV2Client />}
      {tab === 'defaults' && <DefaultsPanel />}
    </div>
  );
}
