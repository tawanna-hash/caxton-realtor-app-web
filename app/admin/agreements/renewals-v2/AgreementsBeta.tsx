'use client';

import { useState } from 'react';
import RenewalsV2Client from './RenewalsV2Client';
import NewPartnersPanel from './NewPartnersPanel';
import StatusBoard from './StatusBoard';
import SignedAgreements from './SignedAgreements';
import TemplatesPanel from './TemplatesPanel';
import DefaultsPanel from './DefaultsPanel';
import RecurringPanel from './RecurringPanel';
import StatementsPanel from './StatementsPanel';
import { A } from '@/components/anchor/ui';

type Tab = 'board' | 'renewals' | 'templates' | 'recurring' | 'statements' | 'defaults';
const TABS: Array<[Tab, string]> = [
  ['board', 'Agreements'],
  ['renewals', 'Renewals'],
  ['templates', 'Templates'],
  ['recurring', 'Recurring invoices'],
  ['statements', 'Statements'],
  ['defaults', 'Default settings'],
];
const SUB: Record<Tab, string> = {
  board: 'Create and send new partner agreements, approve check requests, and track every agreement.',
  renewals: 'One-tap renewals, sent one at a time or as a monthly batch.',
  templates: 'Saved ad sizes, frequencies and rates for new agreements.',
  recurring: 'Every recurring invoice schedule from Get Paid, including drafts made when agreements are signed.',
  statements: 'Partners with an open balance and their statement of account.',
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
  const [tab, setTab] = useState<Tab>('board');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className={A.title}>Agreements <span className="ml-1 rounded-full border border-[color:var(--ds-primary)] px-2 py-0.5 align-middle text-xs font-medium text-[color:var(--ds-primary)]">Beta</span></h1>
        <p className={A.subtitle}>{SUB[tab]}</p>
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
            {label}
          </button>
        ))}
      </div>
      {tab === 'board' && (
        <div className="space-y-6">
          <SignedAgreements />
          <Collapsible title="Waiting to be signed"><NewPartnersPanel /></Collapsible>
          <Collapsible title="Pipeline: drafts, sent and signed"><StatusBoard /></Collapsible>
        </div>
      )}
      {tab === 'renewals' && <RenewalsV2Client />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'recurring' && <RecurringPanel />}
      {tab === 'statements' && <StatementsPanel />}
      {tab === 'defaults' && <DefaultsPanel />}
    </div>
  );
}
