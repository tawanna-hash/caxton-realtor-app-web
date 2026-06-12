'use client';

// app/(public)/advertisers/[slug]/AdvertiserDetailClient.tsx
//
// Client view of the public advertiser detail page. Composes the
// advertiser profile (logo, name, tagline, bio, contact, website,
// social, address+directions) with their active listings/promotions
// pulled from builder_inventory by name.

import Link from 'next/link';
import type {
  Advertiser,
  AdvertiserLocation,
  AdvertiserStaff,
} from '@/lib/advertisers';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';

type ThemeInfo = { accent: string; label: string };

type Props = {
  advertiser: Advertiser;
  inventory: BuilderInventoryRow[];
  locations?: AdvertiserLocation[];
  staff?: AdvertiserStaff[];
  theme: ThemeInfo;
  backHref: string;
};

// Admins can upload non-raster logo source files (.pdf, .ai, .eps, .psd) via
// the CRM modal. Those URLs are valid (designers may want to download them)
// but a browser <img> can't render them. Detect these so the public page
// falls back to the initial monogram instead of showing a broken image.
const BROWSER_IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'ico', 'bmp',
]);
function isBrowserRenderableImage(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const path = url.split('?')[0].split('#')[0];
  const m = /\.([a-z0-9]{2,5})$/i.exec(path);
  if (!m) return true; // no extension — give it the benefit of the doubt
  return BROWSER_IMAGE_EXTS.has(m[1].toLowerCase());
}

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

  const hasSocial = !!fb || !!ig || !!li || !!tw || !!yt;

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-6"
        >
          ← All advertisers
        </Link>

        {/* Header — logo + identity */}
        <header className="flex items-start gap-5 sm:gap-7 mb-8 sm:mb-10">
          <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 bg-gray-50 border border-gray-200 rounded-md overflow-hidden flex items-center justify-center">
            {a.avatar_url && isBrowserRenderableImage(a.avatar_url) ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={a.avatar_url}
                alt={`${a.name} logo`}
                className="w-full h-full object-contain"
              />
            ) : (
              <span
                className="text-2xl sm:text-3xl font-semibold"
                style={{ color: theme.accent }}
                aria-hidden="true"
              >
                {a.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p
              className="text-xs uppercase tracking-[0.2em] font-medium mb-2"
              style={{ color: theme.accent }}
            >
              {theme.label}
            </p>
            <h1
              className="text-2xl sm:text-3xl font-semibold text-gray-900 tracking-tight"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {a.name}
            </h1>
            {a.tagline && (
              <p className="text-base sm:text-lg text-gray-700 font-light mt-2 leading-relaxed">
                {a.tagline}
              </p>
            )}
            {a.industry && (
              <p className="text-sm text-gray-500 font-light mt-1">
                {a.industry}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white rounded-md transition-opacity hover:opacity-90"
                  style={{ backgroundColor: theme.accent }}
                >
                  Visit website
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M5 3h6v6M11 3L5.5 8.5M3 5v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              )}
              {hasSocial && (
                <ul className="flex flex-wrap items-center gap-1.5" aria-label="Social links">
                  {fb && <SocialIconLink href={fb} label="Facebook" accent={theme.accent} />}
                  {ig && <SocialIconLink href={ig} label="Instagram" accent={theme.accent} />}
                  {li && <SocialIconLink href={li} label="LinkedIn" accent={theme.accent} />}
                  {tw && <SocialIconLink href={tw} label="X" accent={theme.accent} />}
                  {yt && <SocialIconLink href={yt} label="YouTube" accent={theme.accent} />}
                </ul>
              )}
            </div>
          </div>
        </header>

        {a.bio && (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              About
            </h2>
            <p className="text-base text-gray-800 font-light leading-relaxed whitespace-pre-line">
              {a.bio}
            </p>
          </section>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8 mb-10">
          {locations.length === 0 && address && (
            <section>
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
                  Get directions →
                </a>
              )}
            </section>
          )}
        </div>

        {sortedLocations.length > 0 && (
          <section className="mb-10">
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
                  <li key={loc.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <h3
                        className="text-base font-semibold text-gray-900"
                        style={{ fontFamily: 'Georgia, serif' }}
                      >
                        {loc.label ? toTitleCaseName(loc.label) : 'Office'}
                      </h3>
                      {loc.is_primary && (
                        <span
                          className="text-[10px] uppercase tracking-[0.15em] font-medium px-1.5 py-0.5 rounded"
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
                        Get directions
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {sortedStaff.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              Team
            </h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sortedStaff.map((s) => {
                const assignedLocations = locations.filter((l) => s.location_ids.includes(l.id));
                return (
                  <li key={s.id} className="flex gap-3 rounded-xl border border-gray-200 bg-white p-4">
                    {s.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.photo_url}
                        alt={s.name}
                        className="w-14 h-14 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-lg font-semibold flex-shrink-0">
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
                        style={{ fontFamily: 'Georgia, serif' }}
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
                              className="text-[10px] uppercase tracking-[0.1em] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"
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
          <section className="border-t border-gray-200 pt-8 mb-10">
            <h2
              className="text-xl sm:text-2xl font-semibold text-gray-900 tracking-tight mb-5"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Active listings &amp; promotions
            </h2>

            {promotions.length > 0 && (
              <div className="mb-6">
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
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                  Listings
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
              View all from {a.name} →
            </Link>
          </section>
        )}

        <div className="border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-600 font-light">
            Interested in becoming a partner?{' '}
            <Link
              href="/advertise"
              className="text-gray-900 underline underline-offset-2 hover:no-underline"
            >
              Learn about advertising on Realty News Now
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}

function SocialIcon({ label }: { label: string }) {
  switch (label) {
    case 'Facebook':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.5-1.5h1.5V5c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9V11H8v3h2.3v7h3.2z" />
        </svg>
      );
    case 'Instagram':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
          <circle cx="12" cy="12" r="3.8" />
          <circle cx="17.1" cy="6.9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'LinkedIn':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M6.5 8.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM5 10h3v9H5v-9zm5 0h2.9v1.3h.04c.4-.75 1.4-1.55 2.86-1.55 3.06 0 3.6 2 3.6 4.6V19h-3v-4.1c0-1 0-2.3-1.4-2.3-1.4 0-1.6 1.1-1.6 2.2V19h-3v-9z" />
        </svg>
      );
    case 'X':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M17.5 4h2.8l-6.2 7.1L21.5 20h-5.7l-4.5-5.8L6.2 20H3.4l6.7-7.6L3 4h5.8l4 5.3L17.5 4zm-1 14.4h1.6L7.6 5.5H6L16.5 18.4z" />
        </svg>
      );
    case 'YouTube':
      return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M22 12c0-2.4-.2-4-.6-4.7-.4-.6-1-1-1.6-1.1C18.4 6 12 6 12 6s-6.4 0-7.8.2c-.6.1-1.2.5-1.6 1.1C2.2 8 2 9.6 2 12s.2 4 .6 4.7c.4.6 1 1 1.6 1.1C5.6 18 12 18 12 18s6.4 0 7.8-.2c.6-.1 1.2-.5 1.6-1.1.4-.7.6-2.3.6-4.7zM10 15V9l5 3-5 3z" />
        </svg>
      );
    default:
      return null;
  }
}

function SocialIconLink({
  href,
  label,
  accent,
}: {
  href: string;
  label: string;
  accent: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        title={label}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 bg-white text-gray-600 hover:text-white transition-colors"
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = accent;
          e.currentTarget.style.borderColor = accent;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '';
          e.currentTarget.style.borderColor = '';
        }}
      >
        <SocialIcon label={label} />
      </a>
    </li>
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
        <div className="shrink-0 w-16 h-16 bg-gray-100 border border-gray-200 rounded overflow-hidden">
          {row.thumbnailUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={row.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-gray-300 text-xl" aria-hidden="true">
              🏠
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {row.kind === 'promotion' && (
            <span
              className="inline-block text-[10px] uppercase tracking-wider font-semibold mb-1 px-1.5 py-0.5 rounded"
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
