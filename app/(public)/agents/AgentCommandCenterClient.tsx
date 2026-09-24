'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Calculator,
  ChevronRight,
  Handshake,
  Home,
  Landmark,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { calculateTrecDeadlines, type TrecDeadline } from '@/lib/trec-deadlines';
import type { AgentCommandCenterWorkspace } from '@/lib/agent-command-center-workspace';
import type { TrecFormVersion } from '@/lib/trec-form-versions';
import { trackEvent } from '@/app/posthog-provider';
import ClosingTime from './ClosingTime';

export type ReferralProvider = {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  industry: string | null;
  tagline: string | null;
};

type ReferralCategory = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
};

const REFERRAL_CATEGORIES: ReferralCategory[] = [
  { id: 'all', label: 'All Services', description: 'Every Featured Local Partner', keywords: [] },
  { id: 'title', label: 'Title', description: 'Closing, escrow, and title services', keywords: ['title', 'escrow', 'closing'] },
  { id: 'appraisal', label: 'Appraisal', description: 'Appraisal and valuation support', keywords: ['apprais', 'valuation'] },
  { id: 'remodeling', label: 'Remodeling', description: 'Renovation and repair services', keywords: ['remodel', 'renovat', 'contractor', 'repair'] },
  { id: 'hvac', label: 'A/C & Heating', description: 'HVAC comfort and service experts', keywords: ['hvac', 'air condition', 'heating', 'a/c', 'ac repair'] },
  { id: 'roofing', label: 'Roofing', description: 'Roof inspections and replacement', keywords: ['roof', 'gutter'] },
  { id: 'inspection', label: 'Inspection', description: 'Property and specialty inspections', keywords: ['inspect'] },
  { id: 'lending', label: 'Lending', description: 'Mortgage and financing partners', keywords: ['lender', 'mortgage', 'loan', 'finance'] },
];

const QUICK_TOOLS = [
  {
    href: '/resources/seller-net-sheet',
    eyebrow: 'Listing appointment',
    title: 'Seller net sheet',
    description: 'Build a clean Texas closing estimate before the conversation turns into numbers.',
    icon: Landmark,
    tone: 'bg-[#301D5D] text-white border-[#301D5D]',
    iconTone: 'bg-white/10 text-white',
  },
  {
    href: '/resources/commission-calculator',
    eyebrow: 'Offer strategy',
    title: 'Commission calculator',
    description: 'Model sides, splits, flat fees, and referrals before you write.',
    icon: Calculator,
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#F2EEE7] text-[#301D5D]',
  },
  {
    href: '/resources/buyer-closing-costs',
    eyebrow: 'Buyer consult',
    title: 'Cash-to-close',
    description: 'Set expectations with an easy buyer closing-cost breakdown.',
    icon: Home,
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#F2EEE7] text-[#301D5D]',
  },
  {
    href: '/calendar',
    eyebrow: 'In your market',
    title: 'Local calendar',
    description: 'Keep client conversations local with current events and deadlines.',
    icon: CalendarDays,
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#F2EEE7] text-[#301D5D]',
  },
] as const;

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function providerMatchesCategory(provider: ReferralProvider, category: ReferralCategory): boolean {
  if (category.id === 'all') return true;
  const searchable = `${provider.name} ${provider.industry ?? ''} ${provider.tagline ?? ''}`.toLowerCase();
  return category.keywords.some((keyword) => searchable.includes(keyword));
}

function deadlineTone(deadline: TrecDeadline): string {
  if (deadline.category === 'money') return 'border-[#E7C769] bg-[#FFF9E7]';
  if (deadline.category === 'option') return 'border-[#CFC4E8] bg-[#F8F5FF]';
  return 'border-slate-200 bg-white';
}

export default function AgentCommandCenterClient({
  providers,
  workspaceKey,
  realtorId,
  initialWorkspace,
  initialWorkspaceVersion,
  trecFormVersion,
  trecFormVersions,
}: {
  providers: ReferralProvider[];
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
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [providerRotation, setProviderRotation] = useState(0);

  const selectedCategoryRecord = REFERRAL_CATEGORIES.find((category) => category.id === selectedCategory)
    ?? REFERRAL_CATEGORIES[0];
  const deadlines = useMemo(
    () =>
      calculateTrecDeadlines({
        effectiveDate,
        optionPeriodDays,
        additionalEarnestMoneyDays,
      }),
    [additionalEarnestMoneyDays, effectiveDate, optionPeriodDays],
  );
  const matchingProviders = useMemo(
    () => providers.filter((provider) => providerMatchesCategory(provider, selectedCategoryRecord)),
    [providers, selectedCategoryRecord],
  );
  const visibleProviders = useMemo(() => {
    if (matchingProviders.length <= 2) return matchingProviders;
    const start = (providerRotation * 2) % matchingProviders.length;
    return [0, 1].map((offset) => matchingProviders[(start + offset) % matchingProviders.length]);
  }, [matchingProviders, providerRotation]);

  useEffect(() => {
    if (matchingProviders.length <= 2) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const rotationTimer = window.setInterval(() => {
      setProviderRotation((rotation) => rotation + 1);
    }, 8000);
    return () => window.clearInterval(rotationTimer);
  }, [matchingProviders.length, selectedCategory]);

  const resetPlanner = () => {
    setEffectiveDate('');
    setOptionPeriodDays('');
    setAdditionalEarnestMoneyDays('');
  };

  return (
    <main className="min-h-screen bg-[#F7F5F1] pb-16">
      <section className="border-b border-[#251548] bg-[#301D5D] text-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-end lg:py-16">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F4D06F]">
              <Sparkles className="rnn-inline-icon" aria-hidden="true" />
              Closing Time
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
              Keep Your Deals Moving
            </h1>
            <p className="mt-4 max-w-2xl text-xl font-semibold leading-8 text-white sm:text-2xl">
              Stay Ahead Of Deadlines. Deliver Smoother Closings.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-white/75 sm:text-lg">
              Never Miss A Critical Contract Deadline With Automated Notifications, Generate Instant Financial Estimates, And Connect Clients With Vetted Vendor Partners—All From One Agent-First Platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/agents/closing-time"
                onClick={() => trackEvent('closing_time_opened')}
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-md bg-[#F4D06F] px-5 text-sm font-bold text-[#241642] transition hover:bg-[#FFE296]"
              >
                Open Closing Time
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a
                href="#referral-network"
                className="inline-flex h-[46px] items-center justify-center gap-2 rounded-md border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Find A Local Partner
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <aside className="border border-white/15 bg-white/[0.08] p-4 shadow-2xl shadow-[#140A29]/20 sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F4D06F]">Today&apos;s agent desk</p>
            <div className="mt-5 space-y-4">
              {[
                ['01', 'Map Key TREC Dates', 'Bring the effective date and period terms.'],
                ['02', 'Prepare The Numbers', 'Run the seller net sheet or commission split.'],
                ['03', 'Solve The Next Need', 'Connect with a local partner from the network.'],
              ].map(([number, title, description]) => (
                <div key={number} className="flex gap-3 border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
                  <span className="pt-0.5 text-xs font-bold text-[#F4D06F]">{number}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-1 text-sm leading-5 text-white/60">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section id="deadline-planner" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8 lg:py-10">
          <div className="border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(40,25,77,0.05)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F2EEE7] text-[#301D5D]">
                <CalendarDays className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Quick date check</p>
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
              <div className="bg-[#ECE6DA] p-4 sm:p-6">
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Effective date</span>
                    <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} onBlur={() => effectiveDate && trackEvent('agent_deadline_planner_updated', { field: 'effective_date' })} className="h-[44px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Option period days <span className="font-normal text-slate-500">(optional)</span></span>
                    <input type="number" min="1" inputMode="numeric" value={optionPeriodDays} onChange={(event) => setOptionPeriodDays(event.target.value)} className="h-[44px] w-full border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-[#301D5D]" placeholder="Example: 10" />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-800">Additional earnest days <span className="font-normal text-slate-500">(optional)</span></span>
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

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12 lg:py-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Work faster</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950 sm:mt-3 sm:text-4xl">Client-Ready Tools, One Click Away</h2>
            </div>
            <Link href="/resources" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-[#301D5D] hover:text-[#5B438C]">
              See Every Agent Tool
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:mt-8 md:grid-cols-2 lg:grid-cols-4">
            {QUICK_TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  onClick={() => trackEvent('agent_command_center_tool_opened', { tool: tool.title })}
                  className={`group border p-4 transition hover:-translate-y-1 hover:shadow-xl sm:p-5 md:min-h-[230px] ${tool.tone}`}
                >
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full ${tool.iconTone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] opacity-60 sm:mt-7">{tool.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em]">{tool.title}</h3>
                  <p className="mt-3 text-sm leading-6 opacity-75">{tool.description}</p>
                  <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold">
                    Open Tool <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section id="referral-network" className="scroll-mt-20">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12 lg:py-16">
          <div className="grid gap-5 sm:gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="bg-[#301D5D] p-5 text-white sm:p-9">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[#F4D06F]">
                <Handshake className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-[#F4D06F]">Referral network</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.035em] sm:text-3xl">Your Call List, Built for the Next Deal.</h2>
              <p className="mt-5 text-base leading-7 text-white/75">
                Find local service partners across title, appraisal, remodeling, A/C and heating, roofing, inspections, and lending. Discover who is visible in your market and take the next step with confidence.
              </p>
            </div>

            <div className="border border-slate-200 bg-white p-4 sm:p-8">
              <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Find a service</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-2xl">{selectedCategoryRecord.description}</h3>
                </div>
                <Link
                  href="/partners"
                  className="inline-flex h-[42px] shrink-0 items-center justify-center gap-1 rounded-md border border-[#301D5D] px-4 text-sm font-bold text-[#301D5D] transition hover:bg-[#301D5D] hover:text-white"
                >
                  All Partners <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {REFERRAL_CATEGORIES.map((category) => {
                  const selected = category.id === selectedCategory;
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setProviderRotation(0);
                        trackEvent('agent_referral_network_category_selected', { category: category.id });
                      }}
                      className={`h-[42px] rounded-md border px-3.5 text-sm font-semibold transition ${
                        selected
                          ? 'border-[#301D5D] bg-[#301D5D] text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-[#301D5D] hover:text-[#301D5D]'
                      }`}
                    >
                      {category.label}
                    </button>
                  );
                })}
              </div>

              {visibleProviders.length > 0 ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {visibleProviders.map((provider) => (
                    <Link
                      href={`/partners/${provider.slug}`}
                      key={provider.id}
                      className="group border border-slate-200 bg-[#FCFBF9] p-4 transition hover:border-[#8E78BF] hover:bg-white hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEE8F9] text-[#5B438C]">
                          <Building2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#301D5D]" aria-hidden="true" />
                      </div>
                      <p className="mt-5 text-lg font-semibold tracking-[-0.02em] text-slate-950">{provider.name}</p>
                      <p className="mt-1 text-sm font-medium text-[#5B438C]">{provider.industry || 'Local service partner'}</p>
                      {provider.tagline && <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">{provider.tagline}</p>}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-6 border border-dashed border-slate-300 bg-[#FCFBF9] p-6">
                  <Wrench className="rnn-heading-icon text-[#5B438C]" aria-hidden="true" />
                  <p className="mt-4 text-lg font-semibold text-slate-950">This service category is growing</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    No market-matched partners with this service are available yet. Check back as the local network expands.
                  </p>
                </div>
              )}

              <p className="mt-6 flex gap-2 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">
                <ShieldCheck className="rnn-inline-icon text-[#5B438C]" aria-hidden="true" />
                Partner listings are featured or paid placements where applicable, not an endorsement. Independently verify fit, availability, insurance, licensing, and terms before referring a client.
              </p>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
