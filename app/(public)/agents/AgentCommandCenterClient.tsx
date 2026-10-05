'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Calculator, ChevronRight, RotateCcw, Sparkles } from 'lucide-react';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import type { AgentCommandCenterWorkspace } from '@/lib/agent-command-center-workspace';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import { trackEvent } from '@/app/posthog-provider';
import ClosingTime from './ClosingTime';

export type { ReferralProvider } from './AgentToolsPanels';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function deadlineTone(deadline: TrecDeadline): string {
  if (deadline.category === 'money') return 'border-[#E7C769] bg-[#FFF9E7]';
  if (deadline.category === 'option') return 'border-[#CFC4E8] bg-[#F8F5FF]';
  return 'border-slate-200 bg-white';
}

export default function AgentCommandCenterClient({
  workspaceKey,
  realtorId,
  initialWorkspace,
  initialWorkspaceVersion,
  trecFormVersion,
  trecFormVersions,
}: {
  workspaceKey: string;
  realtorId: string;
  initialWorkspace: AgentCommandCenterWorkspace | null;
  initialWorkspaceVersion: number | null;
  trecFormVersion: TrecFormVersion;
  trecFormVersions: TrecFormVersion[];
}) {
  const [effectiveDate, setEffectiveDate] = useState('');
  const [optionPeriodDays, setOptionPeriodDays] = useState('');
  const [additionalEarnestMoneyDays, setAdditionalEarnestMoneyDays] = useState('');
  const [quickCheckOpen, setQuickCheckOpen] = useState(false);
  const deadlines = useMemo(
    () =>
      calculateTrecDeadlines({
        effectiveDate,
        optionPeriodDays,
        additionalEarnestMoneyDays,
      }),
    [additionalEarnestMoneyDays, effectiveDate, optionPeriodDays],
  );
  const resetPlanner = () => {
    setEffectiveDate('');
    setOptionPeriodDays('');
    setAdditionalEarnestMoneyDays('');
  };

  return (
    <main id="agent-desk" className="min-h-screen bg-white pb-16">
      <section className="border-b border-[#E6E5EC] bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-start">
          <div>
            <p className="ds-eyebrow inline-flex items-center gap-2">
              <Sparkles className="rnn-inline-icon" aria-hidden="true" />
              Closing Time
            </p>
            <h1 className="ds-title mt-2 sm:!text-[2rem]">Keep Your Deals Moving</h1>
            <p className="mt-3 max-w-2xl text-base font-semibold leading-7 text-slate-900">
              Stay Ahead Of Deadlines. Deliver Smoother Closings.
            </p>
            <p className="ds-subtitle max-w-2xl leading-7">
              Never Miss A Critical Contract Deadline With Automated Notifications, Generate Instant Financial Estimates, And Connect Clients With Vetted Vendor Partners—All From One Agent-First Platform.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/agents/closing-time"
                onClick={() => trackEvent('closing_time_opened')}
                className="inline-flex h-[40px] items-center justify-center gap-2 rounded-lg bg-[#301D5D] px-4 text-sm font-semibold text-white transition hover:bg-[#42277C]"
              >
                Open Agent Desk
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#referral-network"
                className="inline-flex h-[40px] items-center justify-center gap-2 rounded-lg border border-[#E6E5EC] bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-[#F4F3F8]"
              >
                Find A Local Partner
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="rounded-xl border border-[#E6E5EC] bg-white p-5">
            <p className="ds-eyebrow">Today&apos;s agent desk</p>
            <div className="mt-4 space-y-4">
              {[
                ['01', 'Map Key TREC Dates', 'Bring the effective date and period terms.'],
                ['02', 'Prepare The Numbers', 'Run the seller net sheet or commission split.'],
                ['03', 'Solve The Next Need', 'Connect with a local partner from the network.'],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-3 border-t border-[#F1F0F5] pt-4 first:border-t-0 first:pt-0">
                  <span className="ds-stat-icon ds-i-purple !h-7 !w-7 text-xs font-semibold">{number}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-0.5 text-sm leading-5 text-slate-500">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="deadline-planner" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-8 sm:pt-8 lg:pt-10">
          <div className="border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(40,25,77,0.05)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EFEAF8] text-[#301D5D]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Quick Date Check</p>
                <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950">Need a Date Without Opening Closing Time?</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Use the compact, unsaved TREC timing check only when you need a fast answer.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setQuickCheckOpen((open) => !open)}
              className="mt-4 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-md bg-[#301D5D] px-4 text-sm font-bold text-white transition hover:bg-[#42277c] sm:mt-0 sm:w-auto"
            >
              <Calculator className="rnn-inline-icon" aria-hidden="true" />
              {quickCheckOpen ? 'Hide Quick Check' : 'Open Quick Date Check'}
            </button>
          </div>

          {quickCheckOpen && (
            <div className="mt-3 grid border border-slate-200 bg-white lg:grid-cols-[0.72fr_1.28fr]">
              <div className="bg-[#FBFBFD] p-4 sm:p-6">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Effective Date</span>
                    <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} onBlur={() => effectiveDate && trackEvent('agent_deadline_planner_updated', { field: 'effective_date' })} className="h-[44px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Option Period Days <span className="font-normal text-slate-500">(optional)</span></span>
                    <input type="number" min="1" inputMode="numeric" value={optionPeriodDays} onChange={(event) => setOptionPeriodDays(event.target.value)} className="h-[44px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]" placeholder="Example: 10" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Additional Earnest Days <span className="font-normal text-slate-500">(optional)</span></span>
                    <input type="number" min="1" inputMode="numeric" value={additionalEarnestMoneyDays} onChange={(event) => setAdditionalEarnestMoneyDays(event.target.value)} className="h-[44px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]" placeholder="Example: 7" />
                  </label>
                  {effectiveDate && <button type="button" onClick={resetPlanner} className="inline-flex h-[38px] items-center gap-2 rounded-md border border-slate-400 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-950"><RotateCcw className="rnn-inline-icon" aria-hidden="true" />Clear</button>}
                </div>
              </div>
              <div className="p-4 sm:p-6">
                {!effectiveDate ? (
                  <p className="text-sm leading-6 text-slate-600">Enter the effective date to see earnest money and option fee delivery timing.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {deadlines.map((deadline) => (
                      <article key={deadline.id} className={`border p-4 ${deadlineTone(deadline)}`}>
                        <p className="text-lg font-semibold tracking-[-0.02em] text-slate-950">{formatDate(deadline.date)}</p>
                        <p className="mt-1 text-sm font-medium text-slate-800">{deadline.label}</p>
                        {deadline.timeLabel && <p className="mt-2 text-xs font-semibold text-[#5B438C]">{deadline.timeLabel}</p>}
                        {deadline.rolloverApplied && <p className="mt-2 text-xs leading-5 text-slate-600">Extended past a weekend or legal holiday.</p>}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <ClosingTime
        panelsOnly
        workspaceKey={workspaceKey}
        realtorId={realtorId}
        initialWorkspace={initialWorkspace}
        initialWorkspaceVersion={initialWorkspaceVersion}
        trecFormVersion={trecFormVersion}
        trecFormVersions={trecFormVersions}
      />


    </main>
  );
}
