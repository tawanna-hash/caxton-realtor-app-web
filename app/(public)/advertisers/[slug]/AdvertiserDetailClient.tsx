'use client';

// app/(public)/advertisers/[slug]/AdvertiserDetailClient.tsx
//
// Client view of the public advertiser detail page. Composes the
// advertiser profile (logo, name, tagline, bio, contact, website,
// social, address+directions) with their active listings/promotions
// pulled from builder_inventory by name.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  Advertiser,
  AdvertiserLocation,
  AdvertiserStaff,
} from '@/lib/advertisers';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import type { EventPhoto, EventPhotoMonth } from '@/lib/event-photos';
import type { FeatureArticle } from '@/lib/feature-articles';
import { builderNameToSlug } from '@/lib/builder-slug';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';
import AdvertiserHeader from '@/components/AdvertiserHeader';

type ThemeInfo = { accent: string; label: string };

type Props = {
  advertiser: Advertiser;
  inventory: BuilderInventoryRow[];
  locations?: AdvertiserLocation[];
  staff?: AdvertiserStaff[];
  eventPhotos?: EventPhotoMonth[];
  featureArticles?: FeatureArticle[];
  theme: ThemeInfo;
  backHref: string;
};

const BRAND_PURPLE = '#301D5D';

function formatLocationAddress(l: AdvertiserLocation): string | null {
  const parts: string[] = [];
  if (l.address) parts.push(l.address);
  if (l.address_2) parts.push(l.address_2);
  const cityStateZip = [l.city, l.state].filter(Boolean).join(', ');
  const tail = [cityStateZip, l.zip].filter(Boolean).join(' ');
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts.join(', ') : null;
}

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function formatAddress(a: Advertiser): string | null {
  const parts: string[] = [];
  if (a.address) parts.push(a.address);
  if (a.address_2) parts.push(a.address_2);
  const cityStateZip = [a.city, a.state].filter(Boolean).join(', ');
  const tail = [cityStateZip, a.zip].filter(Boolean).join(' ');
  if (tail) parts.push(tail);
  return parts.length > 0 ? parts.join(', ') : null;
}

function priceRange(r: BuilderInventoryRow): string | null {
  if (r.priceMin == null && r.priceMax == null) return null;
  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (r.priceMin != null && r.priceMax != null && r.priceMin !== r.priceMax) {
    return `${fmt(r.priceMin)}–${fmt(r.priceMax)}`;
  }
  return fmt(r.priceMin ?? r.priceMax ?? 0);
}

export default function AdvertiserDetailClient({
  advertiser: a,
  inventory,
  locations = [],
  staff = [],
  eventPhotos = [],
  featureArticles = [],
  theme,
  backHref,
}: Props) {
  const website = normalizeUrl(a.website);
  const fb = normalizeUrl(a.facebook_url);
  const ig = normalizeUrl(a.instagram_url);
  const li = normalizeUrl(a.linkedin_url);
  const tw = normalizeUrl(a.twitter_url);
  const yt = normalizeUrl(a.youtube_url);
  const address = formatAddress(a);
  const directionsHref = address
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
    : null;

  // Back-to-top button: appears after scrolling 400px.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const listings = inventory.filter((r) => r.kind === 'listing');
  const promotions = inventory.filter((r) => r.kind === 'promotion');

  // Sort locations alphabetically by label (HQ-flagged location still rendered
  // first so visitors can find the primary office at a glance, but everything
  // else is alphabetized).
  const sortedLocations = [...locations].sort((x, y) => {
    if (x.is_primary && !y.is_primary) return -1;
    if (!x.is_primary && y.is_primary) return 1;
    return (x.label || '').localeCompare(y.label || '', undefined, { sensitivity: 'base' });
  });

  // Staff alphabetized by name.
  const sortedStaff = [...staff].sort((x, y) =>
    (x.name || '').localeCompare(y.name || '', undefined, { sensitivity: 'base' }),
  );

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← All advertisers
        </Link>

        {/* Header is one of six layouts; admin picks per-advertiser. */}
        <AdvertiserHeader
          style={a.header_style}
          theme={theme}
          data={{
            name: a.name,
            tagline: a.tagline ?? null,
            industry: a.industry ?? null,
            avatar_url: a.avatar_url ?? null,
            website,
            social: {
              Facebook: fb,
              Instagram: ig,
              LinkedIn: li,
              X: tw,
              YouTube: yt,
            },
          }}
        />

        {/* Section anchor pills — quick jump nav */}
        <SectionPills
          advertiser={a}
          hasBio={!!a.bio}
          hasEventPhotos={eventPhotos.length > 0}
          hasArticles={featureArticles.length > 0}
          hasLocations={sortedLocations.length > 0 || (!!address && locations.length === 0)}
          hasStaff={sortedStaff.length > 0}
          hasPromotions={promotions.length > 0}
          hasMoveInReady={listings.length > 0}
          accent={BRAND_PURPLE}
        />

        {a.bio && (
          <section id="about" className="mb-10 scroll-mt-4">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              About
            </h2>
            <p className="text-base text-gray-800 font-light leading-relaxed whitespace-pre-line">
              {a.bio}
            </p>
          </section>
        )}

        {eventPhotos.length > 0 && <EventPhotosSection months={eventPhotos} />}

        {featureArticles.length > 0 && <FeatureArticlesSection articles={featureArticles} />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mb-10">
          {locations.length === 0 && address && (
            <section id="location" className="scroll-mt-4">
              <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                Location
              </h2>
              <p className="text-sm text-gray-800 font-light leading-relaxed whitespace-pre-line">
                {address}
              </p>
              {directionsHref && (
                <a
                  href={directionsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-gray-900 underline underline-offset-2 hover:no-underline"
                >
                  Get Directions →
                </a>
              )}
            </section>
          )}
        </div>

        {sortedLocations.length > 0 && (
          <section id="locations" className="mb-10 scroll-mt-4">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              {sortedLocations.length === 1 ? 'Location' : 'Locations'}
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedLocations.map((loc) => {
                const locAddr = formatLocationAddress(loc);
                const dirHref = locAddr
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(locAddr)}`
                  : null;
                return (
                  <li key={loc.id} className="rounded-md border border-gray-200 bg-white p-4">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <h3
                        className="text-base font-semibold text-gray-900"
                      >
                        {loc.label ? toTitleCaseName(loc.label) : 'Office'}
                      </h3>
                      {loc.is_primary && (
                        <span
                          className="text-[10px] uppercase tracking-[0.15em] font-medium px-1.5 py-0.5 rounded-md"
                          style={{ background: `${theme.accent}15`, color: theme.accent }}
                        >
                          HQ
                        </span>
                      )}
                    </div>
                    {locAddr && (
                      <p className="text-sm text-gray-700 font-light leading-relaxed mb-1">
                        {locAddr}
                      </p>
                    )}
                    <dl className="space-y-0.5 text-sm text-gray-700">
                      {loc.phone && (
                        <div>
                          <dt className="sr-only">Phone</dt>
                          <dd>
                            <a href={`tel:${loc.phone}`} className="hover:text-gray-900">
                              {loc.phone}
                            </a>
                          </dd>
                        </div>
                      )}
                      {loc.email && (
                        <div>
                          <dt className="sr-only">Email</dt>
                          <dd>
                            <a href={`mailto:${loc.email}`} className="hover:text-gray-900">
                              {loc.email}
                            </a>
                          </dd>
                        </div>
                      )}
                      {loc.hours && (
                        <div>
                          <dt className="sr-only">Hours</dt>
                          <dd className="text-gray-600 text-xs mt-1">{loc.hours}</dd>
                        </div>
                      )}
                    </dl>
                    {dirHref && (
                      <a
                        href={dirHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-gray-900 underline underline-offset-2 hover:no-underline"
                      >
                        Get Directions
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {sortedStaff.length > 0 && (
          <section id="team" className="mb-10 scroll-mt-4">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              Team
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedStaff.map((s) => {
                const assignedLocations = locations.filter((l) => s.location_ids.includes(l.id));
                return (
                  <li key={s.id} className="flex gap-4 rounded-md border border-gray-200 bg-white p-4">
                    {s.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.photo_url}
                        alt={s.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover object-top flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xl sm:text-2xl font-semibold flex-shrink-0">
                        {s.name
                          .split(' ')
                          .map((p) => p[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-base font-semibold text-gray-900 truncate"
                      >
                        {toTitleCaseName(s.name)}
                      </div>
                      {s.title && <div className="text-xs text-gray-600 mb-1">{toTitleCaseRole(s.title)}</div>}
                      <dl className="space-y-0.5 text-sm text-gray-700">
                        {s.email && (
                          <div className="truncate">
                            <dt className="sr-only">Email</dt>
                            <dd>
                              <a href={`mailto:${s.email}`} className="hover:text-gray-900">
                                {s.email}
                              </a>
                            </dd>
                          </div>
                        )}
                        {s.phone && (
                          <div>
                            <dt className="sr-only">Phone</dt>
                            <dd>
                              <a href={`tel:${s.phone}`} className="hover:text-gray-900">
                                {s.phone}
                              </a>
                            </dd>
                          </div>
                        )}
                      </dl>
                      {assignedLocations.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {assignedLocations.map((loc) => (
                            <span
                              key={loc.id}
                              className="text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600"
                            >
                              {toTitleCaseName(loc.label || loc.city || 'Office')}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}


        {(listings.length > 0 || promotions.length > 0) && (
          <section id="listings" className="border-t border-gray-200 pt-8 mb-10 scroll-mt-4">
            <h2
              className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight mb-5"
            >
              Move-in Ready &amp; Promotions
            </h2>

            {promotions.length > 0 && (
              <div id="promotions" className="mb-6 scroll-mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                  Promotions
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {promotions.map((p) => (
                    <InventoryCardLink key={p.id} row={p} accent={theme.accent} />
                  ))}
                </ul>
              </div>
            )}

            {listings.length > 0 && (
              <div id="move-in-ready-homes" className="scroll-mt-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                  Move-in Ready Homes
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {listings.map((l) => (
                    <InventoryCardLink
                      key={l.id}
                      row={l}
                      accent={theme.accent}
                      priceLabel={priceRange(l)}
                    />
                  ))}
                </ul>
              </div>
            )}

            <Link
              href={`/builders/${builderNameToSlug(a.name)}`}
              className="inline-flex items-center gap-1 mt-5 text-sm font-medium text-gray-900 underline underline-offset-2 hover:no-underline"
            >
              View All From {a.name} →
            </Link>
          </section>
        )}

        <div className="border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-600 font-light">
            Interested In Becoming A Partner?{' '}
            <Link
              href="/advertise"
              className="text-gray-900 underline underline-offset-2 hover:no-underline"
            >
              Learn About Advertising On Realty News Now
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Floating back-to-top arrow */}
      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-11 h-11 rounded-full shadow-lg transition-opacity hover:opacity-90"
          style={{ backgroundColor: BRAND_PURPLE }}
          aria-label="Back to top"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
    </main>
  );
}

function InventoryCardLink({
  row,
  accent,
  priceLabel,
}: {
  row: BuilderInventoryRow;
  accent: string;
  priceLabel?: string | null;
}) {
  return (
    <li>
      <Link
        href={`/inventory/${row.id}`}
        className="flex items-stretch gap-3 p-3 border border-gray-200 rounded-md hover:border-gray-400 transition-colors"
      >
        <div className="shrink-0 w-24 h-24 bg-gray-100 border border-gray-200 rounded-md overflow-hidden">
          <ListingThumbnail src={row.thumbnailUrl ?? null} />
        </div>
        <div className="flex-1 min-w-0">
          {row.kind === 'promotion' && (
            <span
              className="inline-block text-[10px] uppercase tracking-wider font-semibold mb-1 px-1.5 py-0.5 rounded-md"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
            >
              Promotion
            </span>
          )}
          <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
            {row.title}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {row.city}, {row.state}
            {priceLabel ? ` · ${priceLabel}` : ''}
          </p>
        </div>
      </Link>
    </li>
  );
}

// Small helper that renders a listing thumbnail with a graceful fallback
// when the source URL fails to load. Some advertisers (notably David
// Weekley Homes) source thumbnails from a CDN that blocks hotlinks, so
// the `src` is set but every `<img>` ends up showing the browser's
// broken-image icon. Swapping to the same 🏠 placeholder used when the
// URL is missing entirely keeps the grid visually consistent.
function ListingThumbnail({ src }: { src: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!src || errored) {
    return (
      <span className="w-full h-full flex items-center justify-center text-gray-300 text-xl" aria-hidden="true">
        🏠
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="w-full h-full object-cover"
      loading="lazy"
      onError={() => setErrored(true)}
    />
  );
}

// Horizontal scrollable row of anchor pills for quick section jumping.
// Each pill links to #section-id so the browser handles smooth scroll.
// Only sections that exist on this advertiser's page are shown.
function SectionPills({
  hasBio,
  hasEventPhotos,
  hasArticles,
  hasLocations,
  hasStaff,
  hasPromotions,
  hasMoveInReady,
  accent,
}: {
  advertiser: Advertiser;
  hasBio: boolean;
  hasEventPhotos: boolean;
  hasArticles: boolean;
  hasLocations: boolean;
  hasStaff: boolean;
  hasPromotions: boolean;
  hasMoveInReady: boolean;
  accent: string;
}) {
  const pills: { id: string; label: string }[] = [];
  if (hasBio) pills.push({ id: 'about', label: 'About' });
  if (hasEventPhotos) pills.push({ id: 'event-photos', label: 'Event Photos' });
  if (hasArticles) pills.push({ id: 'feature-articles', label: 'Articles' });
  if (hasLocations) pills.push({ id: 'locations', label: 'Locations' });
  if (hasStaff) pills.push({ id: 'team', label: 'Team' });
  if (hasPromotions) pills.push({ id: 'promotions', label: 'Promotions' });
  if (hasMoveInReady) pills.push({ id: 'move-in-ready-homes', label: 'Move-in Ready Homes' });

  if (pills.length <= 1) return null;

  return (
    <nav className="flex flex-wrap gap-2 mb-8" aria-label="Section navigation">
      {pills.map((pill) => (
        <a
          key={pill.id}
          href={`#${pill.id}`}
          className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:bg-gray-50"
          style={{
            color: accent,
            borderColor: `${accent}40`,
            background: `${accent}08`,
          }}
        >
          {pill.label}
        </a>
      ))}
    </nav>
  );
}

const MONTHS_PER_PAGE = 3;

// Event coverage the publication shot for this advertiser, newest month first.
// Months collapse so an advertiser with years of archives doesn't push the rest
// of the profile off the page; the most recent month starts open, and only a
// page of folders renders until the visitor asks for more.
function EventPhotosSection({ months }: { months: EventPhotoMonth[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    [months[0].monthKey]: true,
  }));
  const [lightbox, setLightbox] = useState<EventPhoto | null>(null);
  const [visibleCount, setVisibleCount] = useState(MONTHS_PER_PAGE);

  const toggle = (monthKey: string) =>
    setExpanded((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));

  const visibleMonths = months.slice(0, visibleCount);

  return (
    <section id="event-photos" className="border-t border-gray-200 pt-8 mb-10 scroll-mt-4">
      <h2
        className="text-xl sm:text-2xl font-semibold tracking-tight mb-5"
        style={{ color: BRAND_PURPLE }}
      >
        Event Photos
      </h2>

      <div className="space-y-3">
        {visibleMonths.map((month) => {
          const isOpen = expanded[month.monthKey] ?? false;
          return (
            <div key={month.monthKey} className="border border-gray-200 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(month.monthKey)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold" style={{ color: BRAND_PURPLE }}>
                    {month.monthLabel}
                  </span>
                  <span className="text-xs text-gray-500">
                    {month.photos.length} {month.photos.length === 1 ? 'photo' : 'photos'}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-gray-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}
                >
                  ▼
                </span>
              </button>

              {isOpen && (
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-3">
                  {month.photos.map((photo) => (
                    <li key={photo.id}>
                      <button
                        type="button"
                        onClick={() => setLightbox(photo)}
                        className="w-full text-left group"
                      >
                        <span className="block aspect-square bg-gray-100 rounded-md overflow-hidden border border-gray-200 group-hover:border-gray-400 transition-colors">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumbnailUrl || photo.imageUrl}
                            alt={photo.title}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </span>
                        <span className="block mt-1.5 text-xs font-medium text-gray-800 line-clamp-2">
                          {photo.title}
                        </span>
                        {photo.description && (
                          <span className="block text-xs text-gray-500 font-light line-clamp-2">
                            {photo.description}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {months.length > MONTHS_PER_PAGE && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-xs text-gray-500">
            Showing {visibleMonths.length} of {months.length} months
          </p>
          {visibleCount < months.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + MONTHS_PER_PAGE)}
              className="px-5 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: BRAND_PURPLE }}
            >
              Load More
            </button>
          )}
        </div>
      )}

      {lightbox && <EventPhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
    </section>
  );
}

// Editorial pieces the publication wrote about this advertiser. Articles either
// link out to the full piece (WordPress) or carry their body inline, in which
// case the card expands in place rather than navigating away.
function FeatureArticlesSection({ articles }: { articles: FeatureArticle[] }) {
  return (
    <section id="feature-articles" className="border-t border-gray-200 pt-8 mb-10 scroll-mt-4">
      <h2
        className="text-xl sm:text-2xl font-semibold tracking-tight mb-5"
        style={{ color: BRAND_PURPLE }}
      >
        Feature Articles
      </h2>

      <ul className="space-y-4">
        {articles.map((article) => (
          <li key={article.id}>
            <FeatureArticleCard article={article} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeatureArticleCard({ article }: { article: FeatureArticle }) {
  const [expanded, setExpanded] = useState(false);
  const href = normalizeUrl(article.articleUrl);
  const byline = [article.author, formatArticleDate(article.publishedAt)]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="border border-gray-200 rounded-md overflow-hidden">
      {article.imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          className="w-full max-h-72 object-cover bg-gray-100"
        />
      )}
      <div className="p-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 leading-snug">
          {article.title}
        </h3>
        {byline && <p className="mt-1 text-xs text-gray-500">{byline}</p>}
        {article.excerpt && (
          <p className="mt-2 text-sm text-gray-700 font-light leading-relaxed">
            {article.excerpt}
          </p>
        )}

        {expanded && article.content && (
          <p className="mt-3 text-sm text-gray-800 font-light leading-relaxed whitespace-pre-line">
            {article.content}
          </p>
        )}

        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-3 text-sm font-medium underline underline-offset-2 hover:no-underline"
            style={{ color: BRAND_PURPLE }}
          >
            Read article →
          </a>
        ) : article.content ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1 mt-3 text-sm font-medium underline underline-offset-2 hover:no-underline"
            style={{ color: BRAND_PURPLE }}
          >
            {expanded ? 'Show less' : 'Read article →'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

// Dates arrive as YYYY-MM-DD. Parsing through Date() applies the local
// timezone and can shift the day, so the parts are pinned to UTC.
function formatArticleDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function EventPhotoLightbox({ photo, onClose }: { photo: EventPhoto; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={photo.title}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-white/80 hover:text-white text-2xl leading-none px-2"
          >
            ×
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.imageUrl}
          alt={photo.title}
          className="w-full max-h-[75vh] object-contain bg-black rounded-md"
        />
        <p className="mt-3 text-sm font-medium text-white">{photo.title}</p>
        {photo.description && (
          <p className="mt-1 text-sm text-white/70 font-light">{photo.description}</p>
        )}
      </div>
    </div>
  );
}
