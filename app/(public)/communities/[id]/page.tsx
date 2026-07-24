// app/(public)/communities/[id]/page.tsx
//
// Public detail page for a single community row from builder_inventory
// (homeType='community'). Renders the full David Weekley community page
// data when available (home plans, amenities, schools, tax info, sales
// office + driving directions, gallery, lifecycle status badges), and
// falls back to a clean shell for communities without structured data.
//
// Only rows with status='active' AND homeType='community' render publicly.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBuilderInventoryById } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';
import InventoryGallery from '@/components/inventory/InventoryGallery';
import CommunityDetailFloater from '@/components/communities/CommunityDetailFloater';
import {
  formatPriceRange,
  formatBedBathSqft,
  formatDate,
} from '@/lib/builder-format';

// Decode common HTML entities (numeric + a small named set) and strip any
// residual tags so scraped descriptions render as plain text. The scraper
// also decodes, but this covers rows stored before that change.
function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
    lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
    eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', iacute: 'í',
    oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä',
    ccedil: 'ç', szlig: 'ß', bull: '•', middot: '·', deg: '°',
  };
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (_, n) => (n in named ? named[n] : `&${n};`));
}

function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  const trimmed = decodeHtmlEntities(description)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return trimmed || null;
}

type Params = { id: string };

export async function generateMetadata(
  { params }: { params: Promise<Params> },
): Promise<Metadata> {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return { title: 'Community' };
  const row = await getBuilderInventoryById(numericId);
  if (!row || row.status !== 'active' || row.homeType !== 'community') {
    return { title: 'Community' };
  }
  const name = row.communityName || row.title;
  const desc = cleanDescription(row.description) || '';
  return {
    title: `${name} — ${row.builderName}`,
    description: desc.slice(0, 200),
    openGraph: {
      title: `${name} — ${row.builderName}`,
      description: desc.slice(0, 200),
      images: row.thumbnailUrl ? [{ url: row.thumbnailUrl }] : undefined,
    },
  };
}

function StatusBadge({ status }: { status: 'coming-soon' | 'close-out' }) {
  const map = {
    'coming-soon': { label: 'Coming Soon', cls: 'bg-orange-600' },
    'close-out': { label: 'Close Out', cls: 'bg-red-600' },
  } as const;
  const { label, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${cls}`}
    >
      {label}
    </span>
  );
}

export default async function CommunityDetailPage(
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();
  const row = await getBuilderInventoryById(numericId);
  if (!row || row.status !== 'active' || row.homeType !== 'community') {
    notFound();
  }

  const cd = row.communityData;
  const name = row.communityName || row.title;
  const cityLine = [row.city, row.state].filter(Boolean).join(', ');
  const price = formatPriceRange(row.priceMin, row.priceMax) || cd?.priceFrom || null;
  const specs = formatBedBathSqft(row);
  const sqftLine = specs || (cd?.sqftRange ? `${cd.sqftRange} SQ. FT.` : null);
  const ready = row.readyDate ? formatDate(row.readyDate) : null;
  const builderSlug = builderNameToSlug(row.builderName);
  const cleanedDesc = cleanDescription(row.description);
  const aboutDesc =
    cleanedDesc ??
    `New construction homes from ${row.builderName} in ${name}, ${cityLine}. View floor plans, pricing, and move-in ready inventory from the builder.`;

  const isPdfUrl = (u: string | null | undefined) =>
    !!u && u.toLowerCase().endsWith('.pdf');
  const websiteUrl =
    row.sourceUrl && !isPdfUrl(row.sourceUrl)
      ? row.sourceUrl
      : row.flyerPdfUrl && !isPdfUrl(row.flyerPdfUrl)
        ? row.flyerPdfUrl
        : null;
  const flyerPdfUrl =
    row.flyerPdfUrl && isPdfUrl(row.flyerPdfUrl)
      ? row.flyerPdfUrl
      : row.sourceUrl && isPdfUrl(row.sourceUrl)
        ? row.sourceUrl
        : null;

  const galleryUrls =
    row.galleryUrls && row.galleryUrls.length > 0
      ? row.galleryUrls
      : cd?.imageUrls && cd.imageUrls.length > 0
        ? cd.imageUrls
        : null;
  const sales = cd?.salesOffice ?? null;
  const plans = cd?.homePlans ?? [];
  const amenities = cd?.amenities ?? [];
  const schools = cd?.schools;
  const tax = cd?.taxInfo;
  const status = cd?.status ?? null;
  const adultOnly = cd?.adultOnly === true;

  const mapsUrl = sales?.lat != null && sales.lng != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${sales.lat},${sales.lng}`
    : sales?.address
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sales.address)}`
      : null;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Left: gallery + overview + home plans */}
        <div className="lg:col-span-3">
          <InventoryGallery
            galleryUrls={galleryUrls}
            thumbnailUrl={row.thumbnailUrl}
            alt={name}
          />

          <section className="mt-6">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              About this community
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-700 dark:text-neutral-300">
              {aboutDesc}
            </p>
          </section>

          {plans.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Home Plans
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((p) => {
                  const planSpecs = [
                    p.stories ? `${p.stories} ${p.stories === '1' ? 'story' : 'stories'}` : null,
                    p.beds ? `${p.beds} bed` : null,
                    p.baths ? `${p.baths} bath` : null,
                    p.garages ? `${p.garages} car garage` : null,
                    p.sqftDisplay ? `${p.sqftDisplay} sq.ft.` : null,
                  ].filter(Boolean);
                  const Tag = p.url ? 'a' : 'div';
                  return (
                    <Tag
                      key={p.name}
                      {...(p.url
                        ? { href: p.url, target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                      className="group overflow-hidden rounded-md border border-neutral-200 bg-white no-underline transition hover:border-orange-400 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <div className="relative aspect-[4/3] bg-neutral-100 dark:bg-neutral-800">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                            No image available
                          </div>
                        )}
                        {p.isModel && (
                          <span className="absolute left-2 top-2 rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            Model Home
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.name}
                        </h3>
                        {p.priceDisplay && (
                          <p className="mt-0.5 text-sm font-medium text-orange-600">
                            {p.priceDisplay}
                          </p>
                        )}
                        {planSpecs.length > 0 && (
                          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                            {planSpecs.join(' · ')}
                          </p>
                        )}
                        {p.url && (
                          <span className="mt-2 inline-block text-xs font-medium text-orange-600 group-hover:underline">
                            View floor plan
                          </span>
                        )}
                      </div>
                    </Tag>
                  );
                })}
              </div>
            </section>
          )}

          {amenities.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Amenities
              </h2>
              <ul className="mt-4 grid grid-cols-2 gap-2 text-sm text-neutral-700 dark:text-neutral-300 sm:grid-cols-3">
                {amenities.map((a) => (
                  <li key={a} className="flex items-center gap-2">
                    <span className="text-orange-600">•</span>
                    {a}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {schools && (schools.list.length > 0 || schools.district) && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Schools
              </h2>
              {schools.district && (
                <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
                  <span className="font-medium">District:</span> {schools.district}
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {schools.list.map((s) => (
                  <li
                    key={s.name}
                    className="rounded-md border border-neutral-200 p-3 text-sm dark:border-neutral-700"
                  >
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {s.name}
                      {s.grades && (
                        <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                          ({s.grades})
                        </span>
                      )}
                    </p>
                    {s.address && (
                      <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                        {s.address}
                      </p>
                    )}
                    <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                      {s.phone && <span>{s.phone}</span>}
                      {s.phone && s.website && <span> · </span>}
                      {s.website && (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-600 hover:underline"
                        >
                          Website
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tax && (tax.entities.length > 0 || tax.total) && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Tax Info
              </h2>
              <ul className="mt-3 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                {tax.entities.map((e) => (
                  <li key={e.name} className="flex justify-between gap-4">
                    <span>{e.name}</span>
                    <span className="font-medium">{e.rate}</span>
                  </li>
                ))}
              </ul>
              {tax.total && (
                <p className="mt-2 border-t border-neutral-200 pt-2 text-sm font-semibold text-neutral-900 dark:border-neutral-700 dark:text-neutral-100">
                  Total: {tax.total}
                </p>
              )}
            </section>
          )}

          {sales && sales.directions && sales.directions.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Visit the Community
              </h2>
              {sales.address && (
                <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
                  {sales.address}
                </p>
              )}
              {sales.hours && (
                <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                  {sales.hours}
                </p>
              )}
              <ol className="mt-3 space-y-1 text-sm text-neutral-700 dark:text-neutral-300">
                {sales.directions.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-medium text-orange-600">{i + 1}.</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Right: builder pill + stats + address */}
        <aside className="lg:col-span-2">
          <Link
            href={`/builders/${builderSlug}`}
            className="inline-block text-xs uppercase tracking-[0.1em] font-semibold px-3 py-1.5 border border-[#5a0e5f] bg-[#5a0e5f] text-white rounded-md hover:bg-[#301D5D] hover:border-[#301D5D] transition-colors"
          >
            {row.builderName}
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
              {name}
            </h1>
            {status && <StatusBadge status={status} />}
            {adultOnly && (
              <span className="inline-flex items-center rounded-full bg-[#5a0e5f] px-2.5 py-0.5 text-xs font-semibold text-white">
                Adult Only
              </span>
            )}
          </div>

          {cityLine && (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              {cityLine}
            </p>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
            {price && (
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Price</dt>
                <dd className="mt-0.5 font-medium text-neutral-900 dark:text-neutral-100">
                  {price}
                </dd>
              </div>
            )}
            {sqftLine && (
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Sq. Ft.</dt>
                <dd className="mt-0.5 font-medium text-neutral-900 dark:text-neutral-100">
                  {sqftLine}
                </dd>
              </div>
            )}
            {ready && (
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Ready</dt>
                <dd className="mt-0.5 font-medium text-neutral-900 dark:text-neutral-100">
                  {ready}
                </dd>
              </div>
            )}
            {sales?.address && (
              <div className="col-span-2">
                <dt className="text-neutral-500 dark:text-neutral-400">Address</dt>
                <dd className="mt-0.5 font-medium text-neutral-900 dark:text-neutral-100">
                  {sales.address}
                </dd>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center rounded-md border border-orange-600 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                  >
                    Get Directions
                  </a>
                )}
              </div>
            )}
          </dl>
        </aside>
      </div>

      <CommunityDetailFloater
        rowId={row.id}
        builderName={row.builderName}
        communityName={row.communityName}
        websiteUrl={websiteUrl}
        flyerPdfUrl={flyerPdfUrl}
        shareTitle={`${name} — ${row.builderName}`}
      />
    </div>
  );
}
