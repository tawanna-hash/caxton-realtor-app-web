'use client';

// Move-in Ready Homes scraper guide content.
// Rendered inside the Scraper Hub "Move-in Ready Homes Guide" tab
// and on the standalone /admin/inventory/scraper-guide page.

import Link from 'next/link';

// ── M/I Homes listing 199 — the reference example (real production data) ──
const EXAMPLE = {
  builderName: 'M/I Homes',
  title: 'San Gabriel - C at Barksdale',
  city: 'Leander',
  state: 'TX',
  planName: 'San Gabriel - C',
  communityName: 'Barksdale',
  address: '3721 Plentywood Lane, Leander, TX 78641',
  readyDate: '2026-09-11',
  beds: 4,
  baths: 5,
  sqft: 3714,
  price: 769990,
  thumbnailUrl:
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50035',
  gallery: [
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50060',
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4975809-50060',
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994774-50060',
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/5025179-50060',
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994780-50060',
    'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/5025183-50060',
  ],
  sourceUrl:
    'https://www.mihomes.com/new-homes/texas/greater-austin/leander/barksdale/san-gabriel-plan/3721-plentywood-lane',
  description:
    'Step inside this expansive and thoughtfully designed new residence at 3721 Plentywood Lane in Leander, TX. This home offers a functional layout that balances open social areas with quiet private spaces. Key Features: 4 generous bedrooms, including a primary suite located on the first floor; 3 full bathrooms and 2 half bathrooms; 3,714 square feet across two levels; airy main-floor hub joining the kitchen and family room. Situated in a desirable Leander community with a welcoming, residential atmosphere and excellent proximity to nearby parks.',
  extraDetails: {
    City: 'Leander, TX',
    County: 'Williamson',
    Homesite: '1106',
    'Home Plan': 'San Gabriel',
    'Home Type': 'Single Family Home',
    'MLS Number': '2244257',
    "Owner's Suite": 'First Floor',
    'Foundation Type': 'Slab',
    'School District': 'Leander ISD',
    'Base Plan Width & Depth': '49.11 x 61.55',
    _latitude: '30.566917',
    _longitude: '-97.783389',
    _floorplanUrl: 'https://rifp.ml3ds-icon.com/#/floorplan/206628?floorId=279841',
  },
} as const;

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

const fmtPrice = (n: number) => `$${n.toLocaleString('en-US')}`;
const fmtReady = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function MoveInReadyGuideContent() {
  return (
    <>
      <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
        Reference spec for building a new builder/developer move-in scraper.
        Uses{' '}
        <Link
          href="/inventory/199"
          className="text-brand-700 underline hover:text-brand-800"
        >
          M/I Homes listing 199
        </Link>{' '}
        as the gold-standard field example. Full written spec:{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
          docs/scraper-template.md
        </code>
        .
      </p>

      {/* ── Visual mockup of the public /inventory/[id] page ── */}
      <Section title="Visual mockup — public move-in listing page">
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          This is a faithful preview of what the public{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
            /inventory/[id]
          </code>{' '}
          page renders. Purple tags annotate which scraper field produces each
          element. Aim to populate every tagged field when building a new
          scraper.
        </p>

        {/* Browser frame */}
        <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden bg-white">
          <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 border-b border-gray-200">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-500 font-mono truncate">
              realtynewsnow.app/inventory/199
            </span>
          </div>

          <div className="p-5 sm:p-7">
            {/* 2-col layout matching the public page */}
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
              {/* Left: gallery + description */}
              <div>
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
                <div className="mt-2 grid grid-cols-6 gap-2">
                  {EXAMPLE.gallery.map((g, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded overflow-hidden border border-gray-200 bg-gray-100"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g}
                        alt={`gallery ${i + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-1">
                  <FieldBadge name="galleryUrls" />
                </div>

                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    About this home <FieldBadge name="description" />
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed line-clamp-6">
                    {EXAMPLE.description}
                  </p>
                </div>
              </div>

              {/* Right: summary sidebar */}
              <aside className="space-y-5">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-block text-xs uppercase tracking-[0.1em] font-semibold px-3 py-1.5 border border-[#5a0e5f] bg-[#5a0e5f] text-white rounded-md">
                      {EXAMPLE.builderName}
                    </span>
                    <FieldBadge name="builderName" />
                  </div>
                  <p className="text-xl font-semibold text-gray-900 leading-snug">
                    {EXAMPLE.title} <FieldBadge name="title" />
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    {EXAMPLE.communityName} <FieldBadge name="communityName" />
                  </p>
                  <p className="mt-1 text-sm text-gray-700">
                    {EXAMPLE.address} <FieldBadge name="address" />
                  </p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <p className="text-3xl font-semibold text-gray-900">
                    {fmtPrice(EXAMPLE.price)}
                  </p>
                  <div className="mt-1">
                    <FieldBadge name="priceMin / priceMax" />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    {([
                      ['Bedrooms', String(EXAMPLE.beds), 'bedsMin/bedsMax'],
                      ['Bathrooms', String(EXAMPLE.baths), 'bathsMin/bathsMax'],
                      ['Sq ft', EXAMPLE.sqft.toLocaleString('en-US'), 'sqftMin/sqftMax'],
                      ['Move-in', fmtReady(EXAMPLE.readyDate), 'readyDate'],
                      ['Plan', EXAMPLE.planName, 'planName'],
                    ] as [string, string, string][]).map(([label, value, field]) => (
                      <div key={label}>
                        <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">
                          {label}
                        </dt>
                        <dd className="text-gray-900 font-medium">{value}</dd>
                        <div className="mt-0.5">
                          <FieldBadge name={field} />
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <span className="inline-block w-full text-center bg-brand-700 text-white px-4 py-2 text-sm font-medium rounded-md">
                    Builder Site →
                  </span>
                  <div>
                    <FieldBadge name="sourceUrl" />
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Additional Details <FieldBadge name="extraDetails" />
                  </h4>
                  <dl className="text-xs space-y-1">
                    {Object.entries(EXAMPLE.extraDetails).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-gray-500">{k}</dt>
                        <dd className="text-gray-800 text-right truncate max-w-[60%]">
                          {v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </aside>
            </div>

            {/* Full-width sections below the grid — match the real /inventory/[id] page.
                All three are driven by _-prefixed extraDetails keys. */}
            <div className="mt-10 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
                  Floorplan <FieldBadge name="extraDetails._floorplanUrl" />
                </h3>
                <span className="text-xs text-[#5a0e5f]">Open full screen →</span>
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-[16/9] flex items-center justify-center text-xs text-gray-400">
                floorplan viewer — image URL → zoomable; ml3ds-icon.com → iframe
              </div>
            </div>

            <div className="mt-10 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
                  Location <FieldBadge name="extraDetails._latitude + _longitude" />
                </h3>
                <span className="text-xs text-[#5a0e5f]">Get directions →</span>
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-[16/9] flex items-center justify-center text-xs text-gray-400">
                Google Maps embed (q=lat,lng) — renders when both _latitude &amp; _longitude are set
              </div>
            </div>

            <div className="mt-10 border-t border-gray-200 pt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
                  3D Tour <FieldBadge name="extraDetails._virtualTourUrl" />{' '}
                  <span className="text-gray-400 normal-case tracking-normal font-normal">(optional)</span>
                </h3>
                <span className="text-xs text-[#5a0e5f]">Open in new tab →</span>
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100 aspect-[16/9] flex items-center justify-center text-xs text-gray-400">
                3D tour iframe — renders only when _virtualTourUrl is set
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Field reference ── */}
      <Section title="Field reference">
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Field</th>
                <th className="px-4 py-3 font-medium">Example (listing 199)</th>
                <th className="px-4 py-3 font-medium">Source / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                ['externalId', 'Sitecore item id', 'Stable unique id; drives upsert + prune. Never an array index.'],
                ['builderName', 'M/I Homes', 'Exact, case-sensitive — must match on every row + cron prune call.'],
                ['title', 'San Gabriel - C at Barksdale', '`${planName} at ${communityName}` with fallback ladder.'],
                ['city / state', 'Leander / TX', 'State always 2-letter (stateToAbbrev helper).'],
                ['description', '"Step inside…"', 'Prefer detail-page marketing copy; else synthesize from specs.'],
                ['beds / baths / sqft / price', '4 / 5 / 3714 / $769,990', 'Scalars; store min=max for one home. Strip comma-strings.'],
                ['thumbnailUrl', 'cdn.mihomes.com/…/50035', 'Single hero image; absolutize path-only URLs.'],
                ['sourceUrl', 'mihomes.com/…/3721-plentywood-lane', 'Detail-page URL → public "Builder Site" button.'],
                ['galleryUrls', '24 photo URLs', 'From detail-page srcsets; pick largest variant; cap ~30.'],
                ['address', '3721 Plentywood Lane, Leander, TX 78641', 'Assemble street + city, state zip; needs at least a street.'],
                ['readyDate', '2026-09-11', 'YYYY-MM-DD only (dateOnly); reject malformed.'],
                ['planName', 'San Gabriel - C', 'May include elevation letter.'],
                ['communityName', 'Barksdale', 'Friendly name for UI grouping (not the slug).'],
                ['extraDetails', 'County, School District, MLS#…', 'JSONB key/value; non-_ keys render in the Property details grid.'],
                ['extraDetails._latitude + _longitude', '30.566917 / -97.783389', 'Drives the public Location map (Google Maps embed + directions).'],
                ['extraDetails._floorplanUrl', 'rifp.ml3ds-icon.com/#/floorplan/…', 'Drives the Floorplan section (image → zoomable viewer; ml3ds-icon.com → iframe).'],
                ['extraDetails._virtualTourUrl', '(optional) 3D tour URL', 'Drives the 3D Tour iframe section when present.'],
                ['homeType', 'showcase', "Always 'showcase' for move-in inventory."],
              ].map(([f, ex, note]) => (
                <tr key={f}>
                  <td className="px-4 py-3 font-mono text-xs text-brand-700 align-top whitespace-nowrap">
                    {f}
                  </td>
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
              lib/scrapers/&lt;builder&gt;.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Fetch the source + normalize each home into a{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                Scraped&lt;Builder&gt;Row
              </code>
              . Pure data layer — no DB writes. One row per move-in-ready home.
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-5 bg-white">
            <h3 className="font-semibold text-gray-900 mb-1">2. Cron endpoint</h3>
            <code className="text-xs text-brand-700 bg-brand-600/5 px-2 py-1 rounded inline-block">
              app/api/cron/scrape-&lt;builder&gt;/route.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Auth → fetch rows → upsert each via{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                upsertBuilderInventoryByExternalId
              </code>{' '}
              → prune stale rows (guarded) → return summary JSON.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Build / deploy / verify ── */}
      <Section title="Build, deploy & verify">
        <ol className="space-y-3 text-sm text-gray-700">
          {[
            'Type check (cache-busted — incremental cache gives false passes): delete *.tsbuildinfo, then NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false.',
            'Lint: npx eslint --max-warnings=0 lib/scrapers/<builder>.ts app/api/cron/scrape-<builder>/route.ts (Husky pre-commit enforces 0 warnings).',
            'Commit + push to main.',
            'Deploy explicitly — the Vercel auto-deploy webhook does NOT fire on push: npx vercel --prod --token "$VERCEL_TOKEN" --yes.',
            'Run the scrape (production needs the bearer): curl -H "Authorization: Bearer $CRON_SECRET" https://realtynewsnow.app/api/cron/scrape-<builder>.',
            'Verify data landed (URL-encode + exact builder match): curl "https://realtynewsnow.app/api/inventory?pub=all&builder=<BUILDER>&limit=5". Confirm description, sourceUrl, galleryUrls, extraDetails, address, readyDate, planName, communityName are populated.',
            'Spot-check one listing on the public site: realtynewsnow.app/inventory/<id>.',
          ].map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-brand-700 text-white text-xs font-medium flex items-center justify-center">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong className="font-semibold">Pitfall:</strong> Cloudflare-protected
          builders (MI Homes, KB Home, Newmark, Santa Rita Ranch) often block the
          scraper — that is a fetch problem, not a data problem. Also remember:
          never remove the{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">
            rows.length &gt; 0
          </code>{' '}
          prune guard, and don&apos;t hide a builder via{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">
            status=&apos;expired&apos;
          </code>{' '}
          — use the Partner Pages visibility toggle instead.
        </div>
      </Section>
    </>
  );
}
