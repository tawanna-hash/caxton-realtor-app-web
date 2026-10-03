'use client';

import Link from 'next/link';
import CollapseToggle, { useCollapsibles } from './CollapseToggle';
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
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { trackEvent } from '@/app/posthog-provider';

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

function providerMatchesCategory(provider: ReferralProvider, category: ReferralCategory): boolean {
  if (category.id === 'all') return true;
  const searchable = `${provider.name} ${provider.industry ?? ''} ${provider.tagline ?? ''}`.toLowerCase();
  return category.keywords.some((keyword) => searchable.includes(keyword));
}


export function WorkFasterPanel() {
  const { section: collapsible, toggleProps } = useCollapsibles();
  return (
    <section>
        <div className="">
        <div {...collapsible('calculators', { mobileOpen: true })} data-section-key={undefined} className="border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Calculator className="rnn-heading-icon text-[#7059A8]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7059A8]">Calculators</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Client-Ready Tools, One Click Away</h2>
            </div>
            <Link href="/resources" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-[#301D5D] hover:text-[#5B438C]">
              See Every Agent Tool
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <CollapseToggle {...toggleProps('calculators', 'calculators', { mobileOpen: true })} />
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
        </div>
      </section>

  );
}

export function ReferralNetworkPanel({ providers }: { providers: ReferralProvider[] }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [providerRotation, setProviderRotation] = useState(0);
  const selectedCategoryRecord = REFERRAL_CATEGORIES.find((category) => category.id === selectedCategory) ?? REFERRAL_CATEGORIES[0];
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

  return (
      <section id="referral-network" className="scroll-mt-20">
        <div className="">
          <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="bg-[#301D5D] p-5 text-white sm:p-9">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-[#F4D06F]">
                  <Handshake className="h-5 w-5" aria-hidden="true" />
                </div>
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
  );
}
