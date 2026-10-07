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
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#EFEAF8] text-[#5B3FA0]',
  },
  {
    href: '/resources/commission-calculator',
    eyebrow: 'Offer strategy',
    title: 'Commission calculator',
    description: 'Model sides, splits, flat fees, and referrals before you write.',
    icon: Calculator,
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#EFEAF8] text-[#5B3FA0]',
  },
  {
    href: '/resources/buyer-closing-costs',
    eyebrow: 'Buyer consult',
    title: 'Cash-to-close',
    description: 'Set expectations with an easy buyer closing-cost breakdown.',
    icon: Home,
    tone: 'bg-white text-slate-900 border-slate-200',
    iconTone: 'bg-[#EFEAF8] text-[#5B3FA0]',
  },
] as const;

// Calculators that open inside the Agent Desk instead of the public site.
const DESK_TOOL_VIEWS: Record<string, string> = {
  '/resources/seller-net-sheet': 'calc-net-sheet',
  '/resources/commission-calculator': 'calc-commission',
  '/resources/buyer-closing-costs': 'calc-cash',
};

function providerMatchesCategory(provider: ReferralProvider, category: ReferralCategory): boolean {
  if (category.id === 'all') return true;
  const searchable = `${provider.name} ${provider.industry ?? ''} ${provider.tagline ?? ''}`.toLowerCase();
  return category.keywords.some((keyword) => searchable.includes(keyword));
}


export function WorkFasterPanel({ onOpenTool }: { onOpenTool?: (toolView: string) => void } = {}) {
  const { section: collapsible, toggleProps } = useCollapsibles();
  return (
    <section>
        <div className="">
        <div {...collapsible('calculators', { mobileOpen: true })} data-section-key={undefined} className="ds-page ds-compact">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="ds-eyebrow">Tools</p>
              <h2 className="ds-title">Calculators</h2>
              <p className="ds-subtitle">Client-ready tools, one click away.</p>
            </div>
            {!onOpenTool && (
              <Link href="/resources" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-bold text-[#301D5D] hover:text-[#5B438C]">
                See Every Agent Tool
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
            <CollapseToggle {...toggleProps('calculators', 'calculators', { mobileOpen: true })} />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:mt-8">
            {QUICK_TOOLS.map((tool) => {
              const Icon = tool.icon;
              const deskView = DESK_TOOL_VIEWS[tool.href];
              if (onOpenTool && deskView) {
                return (
                  <button
                    key={tool.href}
                    type="button"
                    onClick={() => { trackEvent('agent_command_center_tool_opened', { tool: tool.title }); onOpenTool(deskView); }}
                    className={`ds-tool-row group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition hover:bg-[#FBFBFD] sm:p-4 ${tool.tone}`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tool.iconTone}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">{tool.eyebrow}</p>
                      <h3 className="mt-1 text-sm font-semibold tracking-[-0.01em]">{tool.title}</h3>
                      <p className="mt-1 text-xs leading-5 opacity-75">{tool.description}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold">
                      Open Tool <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                );
              }
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  onClick={() => trackEvent('agent_command_center_tool_opened', { tool: tool.title })}
                  className={`group rounded-xl border p-4 transition hover:bg-[#FBFBFD] md:min-h-[200px] ${tool.tone}`}
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tool.iconTone}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] opacity-60 sm:mt-6">{tool.eyebrow}</p>
                  <h3 className="mt-2 text-xl font-semibold tracking-[-0.025em]">{tool.title}</h3>
                  <p className="mt-3 text-sm leading-6 opacity-75">{tool.description}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold">
                    Open Tool <ArrowRight className="h-4 w-4 " aria-hidden="true" />
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
  const { section: collapsible, toggleProps } = useCollapsibles();
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
          <div {...collapsible('referral', { mobileOpen: true })} data-section-key={undefined} className="ds-page ds-compact">
            <div className="flex items-center gap-3">
              <div className="min-w-0">
                <p className="ds-eyebrow">Tools</p>
                <h2 className="ds-title">Referral Network</h2>
                <p className="ds-subtitle">Your call list, built for the next deal.</p>
              </div>
              <CollapseToggle {...toggleProps('referral', 'referral network', { mobileOpen: true })} className="ml-auto" />
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Find local service partners across title, appraisal, remodeling, A/C and heating, roofing, inspections, and lending. Discover who is visible in your market and take the next step with confidence.
            </p>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-gray-500">Find a Service</p>
                  <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-gray-900">{selectedCategoryRecord.description}</h3>
                </div>
                <Link
                  href="/partners"
                  className="inline-flex h-[42px] shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:bg-[#F4F3F8]"
                >
                  All Partners <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
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
                      className={`h-[36px] rounded-full border px-4 text-sm font-medium transition ${
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
                <div className="mt-6 grid gap-3">
                  {visibleProviders.map((provider) => (
                    <Link
                      href={`/partners/${provider.slug}`}
                      key={provider.id}
                      className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:bg-[#FBFBFD]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EFEAF8] text-[#5B3FA0]">
                          <Building2 className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#301D5D]" aria-hidden="true" />
                      </div>
                      <p className="mt-4 text-sm font-semibold text-slate-950">{provider.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#5B438C]">{provider.industry || 'Local Service Partner'}</p>
                      {provider.tagline && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-600">{provider.tagline}</p>}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-6">
                  <Wrench className="rnn-heading-icon text-[#5B438C]" aria-hidden="true" />
                  <p className="mt-4 text-sm font-semibold text-slate-950">This Service Category Is Growing</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                    No market-matched partners with this service are available yet. Check back as the local network expands.
                  </p>
                </div>
              )}

              <p className="mt-6 flex gap-2 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                <ShieldCheck className="rnn-inline-icon text-[#5B438C]" aria-hidden="true" />
                Partner listings are featured or paid placements where applicable, not an endorsement. Independently verify fit, availability, insurance, licensing, and terms before referring a client.
              </p>
            </div>
          </div>
        </div>
      </section>
  );
}
