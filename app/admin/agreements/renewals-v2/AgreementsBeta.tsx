'use client';

import { useState } from 'react';
import RenewalsV2Client from './RenewalsV2Client';
import NewPartnersPanel from './NewPartnersPanel';
import StatusBoard from './StatusBoard';
import TemplatesPanel from './TemplatesPanel';
import DefaultsPanel from './DefaultsPanel';

type Tab = 'board' | 'renewals' | 'new' | 'templates' | 'defaults';
const TABS: Array<[Tab, string]> = [
  ['board', 'Status'],
  ['renewals', 'Renewals'],
  ['new', 'New partners'],
  ['templates', 'Templates'],
  ['defaults', 'Default settings'],
];
const TITLE: Record<Tab, string> = { board: 'Agreements', renewals: 'Renewals', new: 'New partners', templates: 'Templates', defaults: 'Default settings' };

export default function AgreementsBeta() {
  const [tab, setTab] = useState<Tab>('board');
  return (
    <div>
      <div className="flex flex-wrap gap-2 px-4 pt-4 sm:px-6" role="tablist" aria-label="Agreements beta">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${tab === key ? 'border-[#301D5D] bg-[#301D5D] text-white' : 'border-[#D9D5E8] text-[#301D5D] hover:bg-[#F6F5FB]'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'renewals' ? (
        <RenewalsV2Client />
      ) : (
        <div className="space-y-4 p-4 sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B6878]">Admin · Agreements</p>
            <h1 className="mt-1 text-2xl font-semibold text-[#301D5D]">
              {TITLE[tab]} <span className="ml-1 rounded-full bg-[#EFEAFB] px-2 py-0.5 align-middle text-xs font-semibold text-[#42277C]">Beta</span>
            </h1>
          </div>
          {tab === 'board' && <StatusBoard />}
          {tab === 'new' && <NewPartnersPanel />}
          {tab === 'templates' && <TemplatesPanel />}
          {tab === 'defaults' && <DefaultsPanel />}
        </div>
      )}
    </div>
  );
}
