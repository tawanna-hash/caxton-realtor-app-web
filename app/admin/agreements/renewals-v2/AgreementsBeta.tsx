'use client';

import { useState } from 'react';
import RenewalsV2Client from './RenewalsV2Client';
import NewPartnersPanel from './NewPartnersPanel';
import StatusBoard from './StatusBoard';
import TemplatesPanel from './TemplatesPanel';
import DefaultsPanel from './DefaultsPanel';
import NotificationsPanel from './NotificationsPanel';
import InvoicesPanel from './InvoicesPanel';
import ServicesPanel from './ServicesPanel';
import RecurringPanel from './RecurringPanel';
import StatementsPanel from './StatementsPanel';
import PayoutsPanel from './PayoutsPanel';
import { A } from '@/components/anchor/ui';

type Tab = 'board' | 'renewals' | 'new' | 'templates' | 'invoices' | 'recurring' | 'statements' | 'payouts' | 'services' | 'defaults' | 'notifications';
const TABS: Array<[Tab, string]> = [
  ['board', 'Agreements'],
  ['renewals', 'Renewals'],
  ['new', 'Partners'],
  ['templates', 'Templates'],
  ['invoices', 'Invoices'],
  ['recurring', 'Recurring invoices'],
  ['statements', 'Statements'],
  ['payouts', 'Payout'],
  ['services', 'Services'],
  ['defaults', 'Default settings'],
  ['notifications', 'Notifications'],
];
const SUB: Record<Tab, string> = {
  board: 'Every agreement in flight, from draft to signed.',
  renewals: 'One-tap renewals, sent one at a time or as a monthly batch.',
  new: 'Send a new partner a short page to review, pay and sign.',
  templates: 'Saved ad sizes, frequencies and rates for new agreements.',
  invoices: 'Every invoice from Get Paid, with its status and balance.',
  recurring: 'Every recurring invoice schedule from Get Paid, including drafts made when agreements are signed.',
  statements: 'Partners with an open balance and their statement of account.',
  payouts: 'Payouts from Stripe to your bank, with fees and transaction counts.',
  services: 'The Products & Services catalog from Get Paid.',
  defaults: 'Set the default values of new agreements you create.',
  notifications: 'Set which notifications you and your partners will receive.',
};

export default function AgreementsBeta() {
  const [tab, setTab] = useState<Tab>('board');
  return (
    <div className="mx-auto max-w-6xl space-y-5 rounded-lg bg-[#F7F7FA] p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div>
        <h1 className={A.title}>Agreements <span className="ml-1 rounded-full border border-[#5B3FE3] px-2 py-0.5 align-middle text-xs font-medium text-[#5B3FE3]">Beta</span></h1>
        <p className={A.subtitle}>{SUB[tab]}</p>
      </div>
      <div className="flex gap-x-8 overflow-x-auto whitespace-nowrap border-b border-[#D8D5E6]" role="tablist" aria-label="Agreements beta">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`anchor-tab -mb-px border-b-[3px] pb-3 text-[15px] ${tab === key ? 'border-[#5B3FE3] font-medium text-[#261E5A]' : 'border-transparent text-[#6E6A8A] hover:text-[#261E5A]'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'board' && <StatusBoard />}
      {tab === 'renewals' && <RenewalsV2Client />}
      {tab === 'new' && <NewPartnersPanel />}
      {tab === 'templates' && <TemplatesPanel />}
      {tab === 'invoices' && <InvoicesPanel />}
      {tab === 'recurring' && <RecurringPanel />}
      {tab === 'statements' && <StatementsPanel />}
      {tab === 'payouts' && <PayoutsPanel />}
      {tab === 'services' && <ServicesPanel />}
      {tab === 'defaults' && <DefaultsPanel />}
      {tab === 'notifications' && <NotificationsPanel />}
    </div>
  );
}
