'use client';

// Promotion scraper guide content.
// Rendered inside the Scraper Hub "Promotion Guide" tab
// and on the standalone /admin/inventory/promotion-scraper-guide page.

import Link from 'next/link';

// ── inventory/653 — Drees Homes 2026 Realtor Rewards Program (real row) ──
const THUMB =
  'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-thumbs/653/Screenshot%202026-06-11%20at%2012.12.37%E2%80%AFPM-2sxhiu6QyGukVuVcFLFi4TSO8HvxSa.png';
const FLYER =
  'https://b2lqsyyhvbkewrwf.public.blob.vercel-storage.com/inventory-flyers/1781197900454-zw70fexr-drees-custom-homes.pdf';

const EXAMPLE = {
  builderName: 'Drees Homes',
  title: '2026 REALTOR REWARDS PROGRAM EARN MORE WITH DREES CUSTOM HOMES',
  city: 'Greater Austin',
  state: 'TX',
  promoType: 'broker_bonus',
  startsAt: '2026-06-01',
  expiresAt: '2026-09-30',
  description:
    "Don't leave money on the table! Drees truly values the relationships we have developed with our Realtor partners. That's why we want you to make the most of your selling. With Drees Custom Homes, you'll earn 4% commission on ALL sales from June 1 to September 30, 2026*.",
  thumbnailUrl: THUMB,
  flyerPdfUrl: FLYER,
  sourceUrl: null as string | null,
  communityName: null as string | null,
};

function FieldBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded bg-brand-600/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-brand-700 border border-brand-600/20 align-middle">
      {name}
    </span>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 scroll-mt-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function PromotionGuideContent() {
  return (
    <>
      <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
        Reference spec for building a new builder/developer{' '}
        <strong>promotion</strong> scraper — a time-limited offer (realtor
        rewards, rate buydown, closing-cost incentive, sales event). Uses{' '}
        <Link
          href="/inventory/653"
          className="text-brand-700 underline hover:text-brand-800"
        >
          inventory/653 (Drees Homes 2026 Realtor Rewards Program)
        </Link>{' '}
        as the gold-standard field example. Full written spec:{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
          docs/promotion-scraper-template.md
        </code>
        .
      </p>

      {/* ── Visual mockup of the public /inventory/[id] promotion page ── */}
      <Section title="Visual mockup — public promotion page">
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          A faithful preview of what the public{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
            /inventory/[id]
          </code>{' '}
          page renders for a promotion. Purple tags annotate which scraper
          field produces each element. A promotion row carries the offer
          headline + copy, a lifecycle window (
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">startsAt</code>{' '}
          /{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">expiresAt</code>
          ), a <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">promoType</code>{' '}
          classification, and a flyer PDF that renders as a thumbnail carousel.
        </p>

        {/* Browser frame */}
        <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden bg-white">
          <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 border-b border-gray-200">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-500 font-mono truncate">
              realtynewsnow.app/inventory/653
            </span>
          </div>

          <div className="p-5 sm:p-7">
            {/* 2-col layout matching the public page */}
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
              {/* Left: hero + flyer carousel + about + other promotions */}
              <div>
                {/* Hero image */}
                <div className="rounded-md overflow-hidden border border-gray-200 aspect-[4/3] bg-gray-100 relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={EXAMPLE.thumbnailUrl}
                    alt={EXAMPLE.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2">
                    <FieldBadge name="thumbnailUrl" />
                  </div>
                </div>

                {/* Flyer carousel (thumbnail filmstrip) */}
                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Offer flyer <FieldBadge name="flyerPdfUrl" />
                  </h3>
                  <div className="flex gap-2">
                    <div className="w-28 sm:w-32 aspect-[3/4] rounded-md border border-gray-200 bg-gray-100 flex flex-col items-center justify-center relative shadow-sm">
                      <div className="flex-1 flex items-center justify-center text-gray-400">
                        <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                          <path d="M14 2v6h6" />
                          <path d="M9 13h6M9 17h6" />
                        </svg>
                      </div>
                      <div className="w-full bg-gray-200 text-[9px] text-center text-gray-500 py-0.5">
                        Drees-Custom-Homes.pdf
                      </div>
                    </div>
                    <div className="w-28 sm:w-32 aspect-[3/4] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                      page 2…
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <FieldBadge name="flyerPdfUrl · rasterized → carousel" />
                    <span className="inline-flex items-center rounded-md bg-brand-700 px-3 py-1.5 text-xs font-medium text-white">
                      ↓ Download flyer
                    </span>
                  </div>
                </div>

                {/* About */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    About this promotion <FieldBadge name="description" />
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                    {EXAMPLE.description}
                  </p>
                </div>

                {/* Other promotions (siblings) */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Other promotions <FieldBadge name="sibling promos · same builder" />
                  </h3>
                  <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2].map((n) => (
                      <div key={n} className="shrink-0 w-24">
                        <div className="w-24 aspect-[3/4] rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-[10px] text-gray-400">
                          flyer p.1
                        </div>
                        <p className="mt-1 text-[11px] text-brand-700 underline">
                          Offer {n} →
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: sidebar */}
              <aside className="space-y-5">
                {/* Builder pill + Promotion badge */}
                <div>
                  <span className="inline-flex items-center rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    {EXAMPLE.builderName}
                  </span>{' '}
                  <span className="inline-flex items-center rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white">
                    Promotion
                  </span>
                  <div className="mt-1">
                    <FieldBadge name="builderName · kind=promotion" />
                  </div>
                </div>

                {/* Title */}
                <div>
                  <h1 className="text-xl font-bold text-gray-900 leading-snug">
                    {EXAMPLE.title}
                  </h1>
                  <div className="mt-1">
                    <FieldBadge name="title" />
                  </div>
                </div>

                {/* Location */}
                <p className="text-sm text-gray-600">
                  {EXAMPLE.city}, {EXAMPLE.state} <FieldBadge name="city / state" />
                </p>

                {/* promoType */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-1">
                    Offer type <FieldBadge name="promoType" />
                  </h4>
                  <span className="inline-flex items-center rounded-md bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-700">
                    {EXAMPLE.promoType} (broker bonus)
                  </span>
                </div>

                {/* Lifecycle window */}
                <div className="border-t border-gray-200 pt-4">
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">Starts</dt>
                      <dd className="text-gray-900 font-medium">{EXAMPLE.startsAt}</dd>
                      <div className="mt-0.5"><FieldBadge name="startsAt" /></div>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">Available through</dt>
                      <dd className="text-gray-900 font-medium">{EXAMPLE.expiresAt}</dd>
                      <div className="mt-0.5"><FieldBadge name="expiresAt" /></div>
                    </div>
                  </dl>
                </div>

                {/* Request info */}
                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <span className="inline-block w-full text-center bg-brand-700 text-white px-4 py-2 text-sm font-medium rounded-md">
                    Request Information
                  </span>
                  <span className="inline-block w-full text-center border border-gray-300 text-gray-700 px-4 py-2 text-sm font-medium rounded-md">
                    Visit builder site →
                  </span>
                  <div><FieldBadge name="sourceUrl (null here — flyer is the source)" /></div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </Section>

      {/* ── PromoType classification ── */}
      <Section title="promoType — classifying the offer">
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          Map each offer to exactly one value. The union is closed — never
          store freehand strings.
        </p>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">promoType</th>
                <th className="px-4 py-3 font-medium">Use for</th>
                <th className="px-4 py-3 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ['broker_bonus', 'Commission / realtor reward programs', 'Drees 4% realtor rewards'],
                ['rate_buydown', 'Mortgage rate buydowns (e.g. 5.99% for 2 years)', 'M/I 5.99% rate lock'],
                ['incentive', 'Closing-cost credits, free options/upgrades, price cuts', '$15K closing credit'],
                ['event', 'Time-bound sales events (grand opening, model unveiling)', 'Grand Opening weekend'],
                ['other', 'Anything that does not fit the above', 'Sweepstakes'],
              ] as [string, string, string][]).map(([t, use, ex]) => (
                <tr key={t}>
                  <td className="px-4 py-3 font-mono text-xs text-brand-700 align-top whitespace-nowrap">{t}</td>
                  <td className="px-4 py-3 text-gray-800 align-top">{use}</td>
                  <td className="px-4 py-3 text-gray-600 align-top">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Field reference ── */}
      <Section title="Field reference">
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Example (inventory/653)</th>
                <th className="px-4 py-3 font-medium">Source / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ['externalId', 'drees-realtor-rewards-2026', 'Stable builder-side offer id; drives upsert + prune. Derive from offer name + year.'],
                ['kind', 'promotion', "Always 'promotion' (NOT 'listing')."],
                ['publication', 'realtyline', 'Austin = realtyline, San Antonio = newsline.'],
                ['builderName', 'Drees Homes', 'Exact, case-sensitive — must match on every row + cron prune call.'],
                ['title', '2026 REALTOR REWARDS PROGRAM…', 'Offer headline; fallback ladder §5 of the written spec.'],
                ['city / state', 'Greater Austin / TX', 'Market-wide offers use "Greater Austin". State always 2-letter.'],
                ['description', '"Don\'t leave money on the table!…"', 'Offer terms/marketing copy. Scrape verbatim when builder copy.'],
                ['promoType', 'broker_bonus', 'Classify the offer — see table above. Use other if unsure.'],
                ['startsAt', '2026-06-01', 'ISO date the offer begins. Parse from copy.'],
                ['expiresAt', '2026-09-30', 'ISO date the offer ends. Drives "Available through" line + natural prune signal.'],
                ['flyerPdfUrl', '…/drees-custom-homes.pdf', 'Offer one-pager → thumbnail carousel + lightbox + Download. Required field — pass null if none.'],
                ['thumbnailUrl', '…/Screenshot….png', 'Hero image (offer graphic / elevation). Absolutize path-only URLs.'],
                ['sourceUrl', 'null', 'Builder offer page → "Visit builder site". Null when the flyer is the only source (common).'],
                ['communityName', 'null', 'Set only when the offer is scoped to one community.'],
                ['homeType', 'null', 'Promotions have no homeType — never set it.'],
              ] as [string, string, string][]).map(([f, ex, note]) => (
                <tr key={f}>
                  <td className="px-4 py-3 font-mono text-xs text-brand-700 align-top whitespace-nowrap">{f}</td>
                  <td className="px-4 py-3 text-gray-800 align-top">{ex}</td>
                  <td className="px-4 py-3 text-gray-600 align-top">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Two files to create ── */}
      <Section title="Two files to create per builder">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-md border border-gray-200 p-5 bg-white">
            <h3 className="font-semibold text-gray-900 mb-1">1. Scraper module</h3>
            <code className="text-xs text-brand-700 bg-brand-600/5 px-2 py-1 rounded inline-block">
              lib/scrapers/&lt;builder&gt;-promotions.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Fetch the builder&apos;s offers list + per-offer detail, normalize
              each into a{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                Scraped&lt;Builder&gt;PromotionRow
              </code>{' '}
              with{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">kind: &apos;promotion&apos;</code>. Pure data layer — no DB writes. One row per offer.
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-5 bg-white">
            <h3 className="font-semibold text-gray-900 mb-1">2. Cron endpoint</h3>
            <code className="text-xs text-brand-700 bg-brand-600/5 px-2 py-1 rounded inline-block">
              app/api/cron/scrape-&lt;builder&gt;-promotions/route.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Auth → fetch rows → upsert each via{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                upsertBuilderInventoryByExternalId
              </code>{' '}
              (kind=&apos;promotion&apos;) → optionally publish verbatim copy
              (respect &apos;rejected&apos;) → prune via{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                deleteStaleBuilderPromotions
              </code>{' '}
              → return summary JSON.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Build / deploy / verify ── */}
      <Section title="Build, deploy & verify">
        <ol className="space-y-3 text-sm text-gray-700">
          {([
            'Type check (cache-busted — incremental cache gives false passes): delete *.tsbuildinfo, then NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false. Only acceptable error: the lone node_modules/@types/node/tls.d.ts TS1010 artifact. Vercel next build is stricter than local tsc — treat it as source of truth.',
            'Lint: npx eslint --max-warnings=0 lib/scrapers/<builder>-promotions.ts app/api/cron/scrape-<builder>-promotions/route.ts (Husky pre-commit enforces 0 warnings).',
            'Commit + push to main.',
            'Deploy explicitly — the Vercel auto-deploy webhook does NOT fire on push: npx vercel --prod --token "$VERCEL_TOKEN" --yes.',
            'Run the scrape (production needs the bearer): curl -H "Authorization: Bearer $CRON_SECRET" https://realtynewsnow.app/api/cron/scrape-<builder>-promotions.',
            'Verify. Promotions ARE returned by /api/inventory (unlike communities): curl \'https://realtynewsnow.app/api/inventory?pub=all&kind=promotion&limit=100\' (response key is items, not rows). Confirm promoType, expiresAt, flyerPdfUrl, and status. Then spot-check realtynewsnow.app/inventory/<id> — confirm the flyer carousel, "Available through" date, and (for multi-offer builders) the Other promotions strip.',
            'Add the cron schedule to vercel.json crons[] (stagger off existing builder slots).',
          ] as string[]).map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-brand-700 text-white text-xs font-medium flex items-center justify-center">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">Pitfalls:</strong> promotions do NOT
          auto-publish — the upsert only auto-activates kind=&apos;listing&apos;
          rows, so scraped promotions land{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">pending</code>{' '}
          (S14: a human reviews legal text/dates). Publish verbatim builder copy
          in the cron but{' '}
          <strong>never re-activate a rejected row</strong>{' '}
          (<code className="text-xs bg-white/60 px-1 py-0.5 rounded">status !== &apos;rejected&apos;</code>).
          Prune with{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">
            deleteStaleBuilderPromotions
          </code>{' '}
          (DELETE) —{' '}
          <em>not</em>{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">
            deactivateStaleBuilderInventory
          </code>{' '}
          (filters kind=&apos;listing&apos; → no-op for promotions).
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">flyerPdfUrl</code>{' '}
          +{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">thumbnailUrl</code>{' '}
          are required fields — pass null, never omit. Store dates as ISO
          (YYYY-MM-DD), not display strings.{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">promoType</code>{' '}
          is a closed union. Never remove the{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">rows.length &gt; 0</code>{' '}
          prune guard.
        </div>
      </Section>
    </>
  );
}
