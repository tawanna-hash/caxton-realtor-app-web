'use client';

// Community scraper guide content.
// Rendered inside the Scraper Hub "Community Guide" tab
// and on the standalone /admin/inventory/community-scraper-guide page.

import Link from 'next/link';

// ── communities/6 — Barksdale, M/I Homes (real row; real Barksdale photos) ──
const THUMB =
  'https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/4994805-50035';
const G = (s: string) =>
  `https://cdn.mihomes.com/mihomesmedia/83fa975b628c440b9c9bb9768c17d1a1/${s}`;

const EXAMPLE = {
  builderName: 'M/I Homes',
  communityName: 'Barksdale',
  title: 'Barksdale',
  city: 'Leander',
  state: 'TX',
  priceFrom: '$475,000 - $750,000+',
  sqftRange: '2,022 - 3,150',
  thumbnailUrl: THUMB,
  gallery: [G('4994805-50060'), G('4975809-50060'), G('4994774-50060'), G('5025179-50060'), G('4994780-50060'), G('5025183-50060')],
  sourceUrl:
    'https://www.mihomes.com/new-homes/texas/greater-austin/leander/barksdale',
  description:
    'Find the new home of your dreams at Barksdale, a new home community in Leander, TX offering convenience and charm in every corner. The following plans can be personalized for you and built in this community. Students attend highly regarded Leander ISD schools, and Williamson County Regional Park is just 5 miles away.',
  status: null as 'coming-soon' | 'close-out' | null,
  adultOnly: false,
  amenities: ['Clubhouse', 'Fitness Center', 'Swimming Pool', 'Parks & Trails', 'Playground'],
  homePlans: [
    { name: 'San Gabriel - C', beds: '4', baths: '5', sqftDisplay: '3,714', stories: '2', garages: '2', priceDisplay: 'From $769,990', imageUrl: G('4994805-50060'), isModel: true },
    { name: 'San Gabriel - A', beds: '4', baths: '4.5', sqftDisplay: '3,420', stories: '2', garages: '2', priceDisplay: 'From $729,990', imageUrl: G('4975809-50060'), isModel: false },
    { name: 'Lexington', beds: '3', baths: '2.5', sqftDisplay: '2,250', stories: '2', garages: '2', priceDisplay: 'From $549,990', imageUrl: G('4994774-50060'), isModel: false },
  ],
  schools: {
    district: 'Leander ISD',
    list: [
      { name: 'Parkside Elementary', grades: 'PK-5', address: 'Leander, TX 78641' },
      { name: 'Leander Middle', grades: '6-8', address: 'Leander, TX 78641' },
    ],
  },
  taxInfo: {
    entities: [
      { name: 'Leander ISD', rate: '1.28%' },
      { name: 'Williamson County', rate: '0.49%' },
      { name: 'City of Leander', rate: '0.30%' },
    ],
    total: '2.07%',
  },
  salesOffice: {
    address: '8000 Thompson Ln, Leander, TX 78641',
    hours: 'Mon-Sat 10am-7pm, Sun 12-7pm',
    lat: 30.566917,
    lng: -97.783389,
    directions: [
      'From US-183 N, exit Whitestone Blvd',
      'Turn right on Thompson Ln; the model home is on the left',
    ],
  },
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

export default function CommunityGuideContent() {
  return (
    <>
      <p className="text-sm text-gray-600 font-light mt-2 max-w-2xl">
        Reference spec for building a new builder/developer{' '}
        <strong>community</strong> scraper. Companion to the Move-In Homes
        guide. Uses{' '}
        <Link
          href="/communities/6"
          className="text-brand-700 underline hover:text-brand-800"
        >
          communities/6 (Barksdale, M/I Homes)
        </Link>{' '}
        as the gold-standard field example. Full written spec:{' '}
        <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
          docs/community-scraper-template.md
        </code>
        .
      </p>

      {/* ── Visual mockup of the public /communities/[id] page ── */}
      <Section title="Visual mockup — public community page">
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          A faithful preview of what the public{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
            /communities/[id]
          </code>{' '}
          page renders. Purple tags annotate which scraper field produces each
          element. A community row carries the same base fields as a move-in
          home, plus a structured{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">communityData</code>{' '}
          object that drives the Home Plans, Amenities, Schools, Tax Info, and
          Sales Office sections.
        </p>

        {/* Browser frame */}
        <div className="rounded-lg border border-gray-300 shadow-sm overflow-hidden bg-white">
          <div className="flex items-center gap-2 bg-gray-100 px-4 py-2 border-b border-gray-200">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
            <span className="ml-3 text-xs text-gray-500 font-mono truncate">
              realtynewsnow.app/communities/6
            </span>
          </div>

          <div className="p-5 sm:p-7">
            {/* 2-col layout matching the public page */}
            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-8">
              {/* Left: gallery + about + home plans + amenities + schools + tax + sales */}
              <div>
                {/* Gallery */}
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
                      <img src={g} alt={`gallery ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                <div className="mt-1">
                  <FieldBadge name="galleryUrls / communityData.imageUrls" />
                </div>

                {/* About */}
                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    About this community <FieldBadge name="description" />
                  </h3>
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {EXAMPLE.description}
                  </p>
                </div>

                {/* Home Plans */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Home Plans <FieldBadge name="communityData.homePlans" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {EXAMPLE.homePlans.map((p) => (
                      <div
                        key={p.name}
                        className="overflow-hidden rounded-md border border-gray-200 bg-white"
                      >
                        <div className="relative aspect-[4/3] bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                          {p.isModel && (
                            <span className="absolute left-2 top-2 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Model Home
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-semibold text-gray-900">{p.name}</p>
                          <p className="mt-0.5 text-sm font-medium text-orange-600">{p.priceDisplay}</p>
                          <p className="mt-1 text-xs text-gray-600">
                            {[`${p.stories} stories`, `${p.beds} bed`, `${p.baths} bath`, `${p.sqftDisplay} sq.ft.`].join(' · ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Amenities */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Amenities <FieldBadge name="communityData.amenities" />
                  </h3>
                  <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-gray-700">
                    {EXAMPLE.amenities.map((a) => (
                      <li key={a} className="flex items-center gap-2">
                        <span className="text-orange-600">•</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Schools */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Schools <FieldBadge name="communityData.schools" />
                  </h3>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">District:</span> {EXAMPLE.schools.district}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {EXAMPLE.schools.list.map((s) => (
                      <li key={s.name} className="rounded-md border border-gray-200 p-3 text-sm">
                        <p className="font-medium text-gray-900">
                          {s.name} <span className="text-gray-500">({s.grades})</span>
                        </p>
                        <p className="text-gray-600">{s.address}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Tax Info */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Tax Info <FieldBadge name="communityData.taxInfo" />
                  </h3>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {EXAMPLE.taxInfo.entities.map((e) => (
                      <li key={e.name} className="flex justify-between gap-4">
                        <span>{e.name}</span>
                        <span className="font-medium">{e.rate}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-gray-200 pt-2 text-sm font-semibold text-gray-900">
                    Total: {EXAMPLE.taxInfo.total}
                  </p>
                </div>

                {/* Visit / Sales Office */}
                <div className="mt-8">
                  <h3 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Visit the Community <FieldBadge name="communityData.salesOffice" />
                  </h3>
                  <p className="text-sm text-gray-700">{EXAMPLE.salesOffice.address}</p>
                  <p className="text-sm text-gray-600">{EXAMPLE.salesOffice.hours}</p>
                  <ol className="mt-3 space-y-1 text-sm text-gray-700">
                    {EXAMPLE.salesOffice.directions.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="font-medium text-orange-600">{i + 1}.</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ol>
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-semibold text-gray-900 leading-snug">
                      {EXAMPLE.communityName} <FieldBadge name="communityName / title" />
                    </p>
                    {/* status + adultOnly badges render only when set */}
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">
                      status badge (coming-soon / close-out)
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {EXAMPLE.city}, {EXAMPLE.state} <FieldBadge name="city / state" />
                  </p>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    {([
                      ['Price', EXAMPLE.priceFrom, 'priceMin/priceMax · communityData.priceFrom'],
                      ['Sq. Ft.', EXAMPLE.sqftRange, 'sqftMin/sqftMax · communityData.sqftRange'],
                    ] as [string, string, string][]).map(([label, value, field]) => (
                      <div key={label} className="col-span-2">
                        <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">{label}</dt>
                        <dd className="text-gray-900 font-medium">{value}</dd>
                        <div className="mt-0.5">
                          <FieldBadge name={field} />
                        </div>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium mb-2">
                    Address <FieldBadge name="communityData.salesOffice.address" />
                  </h4>
                  <p className="text-sm text-gray-900 font-medium">{EXAMPLE.salesOffice.address}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    lat {EXAMPLE.salesOffice.lat}, lng {EXAMPLE.salesOffice.lng}{' '}
                    <FieldBadge name="salesOffice.lat / lng" />
                  </p>
                  <span className="mt-2 inline-flex items-center rounded-md border border-orange-600 px-3 py-1.5 text-xs font-medium text-orange-600">
                    Get Directions →
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-4 space-y-2">
                  <span className="inline-block w-full text-center bg-brand-700 text-white px-4 py-2 text-sm font-medium rounded-md">
                    Builder Site →
                  </span>
                  <div>
                    <FieldBadge name="sourceUrl" />
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </Section>

      {/* ── communityData: what each sub-object renders ── */}
      <Section title="communityData — what each sub-object renders">
        <p className="text-sm text-gray-600 mb-4 max-w-3xl">
          The structured{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">communityData</code>{' '}
          JSONB column is what distinguishes a community row. Type lives in{' '}
          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
            lib/scrapers/david-weekley.ts
          </code>{' '}
          and is imported across the codebase. Populate every sub-object the
          source exposes; omit what it does not.
        </p>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">communityData field</th>
                <th className="px-4 py-3 font-medium">Public section on /communities/[id]</th>
                <th className="px-4 py-3 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ['homePlans[]', 'Home Plans grid (image, name, price, bed/bath/sqft/stories/garage, "View floor plan", "Model Home" badge)', 'San Gabriel - C · From $769,990'],
                ['amenities[]', 'Amenities bulleted grid', 'Clubhouse, Pool, Trails…'],
                ['schools (district + list)', 'Schools list (name, grades, address, phone, website)', 'Leander ISD'],
                ['taxInfo (entities + total)', 'Tax Info table + total', 'Leander ISD 1.28% · total 2.07%'],
                ['salesOffice (address/hours/directions/lat,lng)', 'Visit the Community + sidebar Address + "Get Directions"', '8000 Thompson Ln…'],
                ['status', 'Sidebar badge — coming-soon (orange) / close-out (red)', 'null (no badge)'],
                ['adultOnly', 'Sidebar "Adult Only" badge (plum)', 'false'],
                ['priceFrom / sqftRange', 'Sidebar Price / Sq. Ft. fallback when numeric range is absent', '$475,000 - $750,000+'],
              ] as [string, string, string][]).map(([f, sec, ex]) => (
                <tr key={f}>
                  <td className="px-4 py-3 font-mono text-xs text-brand-700 align-top whitespace-nowrap">{f}</td>
                  <td className="px-4 py-3 text-gray-800 align-top">{sec}</td>
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
                <th className="px-4 py-3 font-medium">Example (communities/6)</th>
                <th className="px-4 py-3 font-medium">Source / notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {([
                ['externalId', 'mi-barksdale', 'Stable builder-side id; drives upsert + prune. Never an array index.'],
                ['builderName', 'M/I Homes', 'Exact, case-sensitive — must match on every row + cron prune call.'],
                ['title', 'Barksdale', 'Community name; fallback ladder §5 of the written spec.'],
                ['city / state', 'Leander / TX', 'State always 2-letter (stateToAbbrev helper).'],
                ['description', '"Find the new home of your dreams at Barksdale…"', 'Prefer the community marketing copy; else synthesize from specs.'],
                ['priceMin / priceMax', '475000 / 750000', 'Numeric range across plans; also set communityData.priceFrom display string.'],
                ['sqftMin / sqftMax', '2022 / 3150', 'Numeric range across plans; also set communityData.sqftRange.'],
                ['thumbnailUrl', 'cdn.mihomes.com/…/50035', 'Hero image; absolutize path-only URLs.'],
                ['sourceUrl', 'mihomes.com/…/leander/barksdale', 'Builder community page → public "Builder Site" button + share.'],
                ['galleryUrls', 'community photo URLs', 'Same set as communityData.imageUrls; cap ~30.'],
                ['communityName', 'Barksdale', 'Friendly name for UI grouping (not the slug).'],
                ['homeType', 'community', "Always 'community' for community rows (NOT 'showcase')."],
                ['communityData', '(object — see above)', 'Structured detail. Drives Home Plans, Amenities, Schools, Tax, Sales Office.'],
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
              lib/scrapers/&lt;builder&gt;-communities.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Fetch the community list + per-community detail, normalize each
              into a{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                Scraped&lt;Builder&gt;CommunityRow
              </code>{' '}
              with a populated{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">communityData</code>.
              Pure data layer — no DB writes. One row per community.
            </p>
          </div>
          <div className="rounded-md border border-gray-200 p-5 bg-white">
            <h3 className="font-semibold text-gray-900 mb-1">2. Cron endpoint</h3>
            <code className="text-xs text-brand-700 bg-brand-600/5 px-2 py-1 rounded inline-block">
              app/api/cron/scrape-&lt;builder&gt;-communities/route.ts
            </code>
            <p className="text-sm text-gray-600 mt-3">
              Auth → fetch rows → upsert each via{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                upsertBuilderInventoryByExternalId
              </code>{' '}
              with <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">homeType: &apos;community&apos;</code> +{' '}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">communityData</code> → prune stale
              community rows (guarded) → return summary JSON.
            </p>
          </div>
        </div>
      </Section>

      {/* ── Build / deploy / verify ── */}
      <Section title="Build, deploy & verify">
        <ol className="space-y-3 text-sm text-gray-700">
          {[
            'Type check (cache-busted — incremental cache gives false passes): delete *.tsbuildinfo, then NODE_OPTIONS="--max-old-space-size=4096" npx tsc --noEmit --incremental false. Only acceptable error: the lone node_modules/@types/node/tls.d.ts TS1010 artifact.',
            'Lint: npx eslint --max-warnings=0 lib/scrapers/<builder>-communities.ts app/api/cron/scrape-<builder>-communities/route.ts (Husky pre-commit enforces 0 warnings).',
            'Commit + push to main.',
            'Deploy explicitly — the Vercel auto-deploy webhook does NOT fire on push: npx vercel --prod --token "$VERCEL_TOKEN" --yes.',
            'Run the scrape (production needs the bearer): curl -H "Authorization: Bearer $CRON_SECRET" https://realtynewsnow.app/api/cron/scrape-<builder>-communities.',
            'Verify the structured data landed. The public /api/inventory endpoint filters OUT homeType="community" rows, so verify via the cron summary JSON (inserted/updated + communityData populated) and spot-check realtynewsnow.app/communities/<id> (signed in) — confirm Home Plans, Amenities, Schools, Tax Info, and the Sales Office / directions render.',
            'Add the cron schedule to vercel.json crons[] (stagger off existing builder slots).',
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
          <strong className="font-semibold">Pitfalls:</strong> a community row
          needs <code className="text-xs bg-white/60 px-1 py-0.5 rounded">homeType=&apos;community&apos;</code> —
          the public communities route AND the prune filter both key off it, so
          a wrong homeType row never renders and never prunes correctly. Also:
          set both <code className="text-xs bg-white/60 px-1 py-0.5 rounded">galleryUrls</code> and{' '}
          <code className="text-xs bg-white/60 px-1 py-0.5 rounded">communityData.imageUrls</code> from the
          same photo set (the page prefers galleryUrls, then falls back to
          imageUrls); tax rates are display strings (&quot;1.28%&quot;), not numbers;
          split school grades out of the name into the grades field; never
          remove the <code className="text-xs bg-white/60 px-1 py-0.5 rounded">rows.length &gt; 0</code> prune
          guard; and hide a community via the Partner Pages visibility
          toggle, not status=&apos;expired&apos;.
        </div>
      </Section>
    </>
  );
}
