'use client';

// app/(public)/resources/ResourcesClient.tsx
//
// Client component — purely presentational. Pulls all content from
// lib/realtor-resources.ts. No fetches, no state beyond expand/collapse.

import PageTitle from '@/components/ui/PageTitle';
import {
  RESOURCE_GUIDES,
  RESOURCE_LINKS,
  type ResourceGuide,
  type ResourceLink,
} from '@/lib/realtor-resources';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';
const SECTION_EYEBROW = 'text-xs font-semibold uppercase tracking-[0.2em] text-[#1a2a44] mb-4';

export default function ResourcesClient() {
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 md:py-16">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <header className="mb-12">
        <p className={EYEBROW}>REALTOR® Resources</p>
        <PageTitle>Tools, partners, and training for Austin agents.</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          A curated collection of downloadable guides and external
          links our team relies on. Have
          something to add?{' '}
          <a
            href="mailto:hello@myrealtyline.com?subject=Resources%20Page%20Suggestion"
            className="text-[#1a2a44] font-medium underline underline-offset-2"
          >
            Send us a suggestion
          </a>
          .
        </p>
      </header>

      {/* ── Quick jump links ────────────────────────────────────────── */}
      <nav className="mb-12 flex flex-wrap gap-2 text-sm">
        {[
          { href: '#tools', label: 'Tools' },
          { href: '#guides', label: 'Guides & PDFs' },
          { href: '#links', label: 'External Links' },
        ].map((j) => (
          <a
            key={j.href}
            href={j.href}
            className="px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:border-[#1a2a44] hover:text-[#1a2a44] transition"
          >
            {j.label}
          </a>
        ))}
      </nav>

      {/* ── Section 1: Guides ───────────────────────────────────────── */}
      <section id="tools" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Realtor Tools</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Calculators & quick references
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <ToolCard
            href="/resources/mortgage-calculator"
            badge="Calculator"
            title="Mortgage Calculator"
            description="PITI breakdown, affordability analysis, and year-by-year amortization with Austin defaults. Built for showings and buyer consults."
          />
          <ToolCard
            href="/resources/commission-calculator"
            badge="Calculator"
            title="Commission Calculator"
            description="Sale price to take-home. Models side split, referral fee, broker split, and broker flat fee — so you know your number before writing the offer."
          />
          <ToolCard
            href="/resources/seller-net-sheet"
            badge="Printable"
            title="Seller Net Sheet"
            description="Estimate what your seller walks away with at closing. Texas-standard line items, auto title-policy estimate, printable for listing appointments."
          />
          <ToolCard
            href="/resources/title-rate-calculator"
            badge="Calculator"
            title="Texas Title Rate Calculator"
            description="Promulgated TDI premiums (Mar 2026). Owner and Lender policies, R-5 simultaneous issue, R-8 refinance credit, and endorsements (T-19, T-19.1, T-30, T-3)."
          />
          <ToolCard
            href="/resources/buyer-closing-costs"
            badge="Calculator"
            title="Buyer Closing Costs"
            description="Cash-to-close estimator. Lender fees, title, prepaids, and escrow setup — sectioned to match a Texas Closing Disclosure."
          />
          <ToolCard
            href="/resources/rent-vs-buy"
            badge="Analysis"
            title="Rent vs. Buy"
            description="Year-by-year cost comparison with breakeven. Models appreciation, equity, maintenance, and exit costs vs. annual rent escalators."
          />
          <ToolCard
            href="/resources/investment-property"
            badge="Analysis"
            title="Investment Property ROI"
            description="Cash flow, cap rate, cash-on-cash, NOI and DSCR for SFR and small multifamily rentals. Includes 1% and 50% rule checks."
          />
          <ToolCard
            href="/resources/1031-exchange"
            badge="Timeline"
            title="1031 Exchange Timeline"
            description="Track the 45-day identification and 180-day replacement deadlines on a like-kind exchange from the relinquished closing date."
          />
          <ToolCard
            href="/resources/seller-concessions-limits"
            badge="Reference"
            title="Seller&rsquo;s Concession Limits"
            description="Agency caps on what the seller can credit the buyer toward closing costs. Conventional (LTV-banded), FHA, VA, and USDA — with a dollar calculator."
          />
        </div>
      </section>

      <section id="guides" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Downloadable Guides</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          PDFs, checklists, and workbooks
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {RESOURCE_GUIDES.map((g) => (
            <GuideCard key={g.title} guide={g} />
          ))}
        </div>
      </section>

      {/* ── Section 4: External Links ───────────────────────────────── */}
      <section id="links" className="mb-16 scroll-mt-24">
        <p className={SECTION_EYEBROW}>Curated Links</p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Official sources & industry reference
        </h2>
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
          {RESOURCE_LINKS.map((l) => (
            <LinkRow key={l.href + l.title} link={l} />
          ))}
        </ul>
      </section>

      {/* ── Footer note ─────────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 mt-12">
        This page is updated periodically. Items listed here are
        recommendations, not endorsements — confirm fit for your transaction
        and client.
      </p>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card components
// ─────────────────────────────────────────────────────────────────────────────

function ToolCard({
  href,
  badge,
  title,
  description,
}: {
  href: string;
  badge: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="group block rounded-xl border border-gray-200 bg-gradient-to-br from-[#1a2a44]/5 to-white p-6 hover:border-[#1a2a44] hover:shadow-md transition"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1a2a44] bg-[#1a2a44]/10 px-2 py-0.5 rounded">
          {badge}
        </span>
        <span className="text-[#1a2a44] opacity-0 group-hover:opacity-100 transition text-sm">→</span>
      </div>
      <p
        className="text-xl text-gray-900 mb-2"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
      >
        {title}
      </p>
      <p className="text-sm text-gray-700 font-light leading-relaxed">
        {description}
      </p>
    </a>
  );
}

function GuideCard({ guide }: { guide: ResourceGuide }) {
  const isPlaceholder = guide.href === '#';
  return (
    <a
      href={guide.href}
      target={isPlaceholder ? undefined : '_blank'}
      rel={isPlaceholder ? undefined : 'noopener noreferrer'}
      className="block rounded-lg border border-gray-200 bg-white p-5 hover:border-[#1a2a44] hover:shadow-sm transition"
      onClick={(e) => {
        if (isPlaceholder) e.preventDefault();
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        {guide.category && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#1a2a44] bg-[#1a2a44]/5 px-2 py-0.5 rounded">
            {guide.category}
          </span>
        )}
        <span className="text-xs text-gray-400">
          {isPlaceholder ? 'Coming soon' : 'PDF'}
        </span>
      </div>
      <p className="font-semibold text-gray-900 mb-1">{guide.title}</p>
      <p className="text-sm text-gray-700 font-light leading-relaxed">
        {guide.description}
      </p>
    </a>
  );
}

function LinkRow({ link }: { link: ResourceLink }) {
  return (
    <li>
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block px-5 py-4 hover:bg-gray-50 transition"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 mb-0.5">{link.title}</p>
            <p className="text-sm text-gray-700 font-light leading-relaxed">
              {link.description}
            </p>
          </div>
          {link.source && (
            <span className="text-xs text-gray-500 flex-shrink-0 mt-1">
              {link.source} →
            </span>
          )}
        </div>
      </a>
    </li>
  );
}
