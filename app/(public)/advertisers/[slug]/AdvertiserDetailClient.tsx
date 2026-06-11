'use client';

// app/(public)/advertisers/[slug]/AdvertiserDetailClient.tsx
//
// Client view of the public advertiser detail page. Composes the
// advertiser profile (logo, name, tagline, bio, contact, website,
// social, address+directions) with their active listings/promotions
// pulled from builder_inventory by name.

import Link from 'next/link';
import type { Advertiser } from '@/lib/advertisers';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';

type ThemeInfo = { accent: string; label: string };

type Props = {
  advertiser: Advertiser;
  inventory: BuilderInventoryRow[];
  theme: ThemeInfo;
  backHref: string;
};

function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
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

  const hasContact =
    !!a.contact_email || !!a.phone || !!a.office_phone || !!website;
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
            {a.avatar_url ? (
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
            {(a.title || a.industry) && (
              <p className="text-sm text-gray-500 font-light mt-1">
                {[a.title, a.industry].filter(Boolean).join(' · ')}
              </p>
            )}

            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-medium text-white rounded-md transition-opacity hover:opacity-90"
                style={{ backgroundColor: theme.accent }}
              >
                Visit website
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5 3h6v6M11 3L5.5 8.5M3 5v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            )}
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
          {hasContact && (
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                Contact
              </h2>
              <dl className="space-y-2 text-sm">
                {website && (
                  <div>
                    <dt className="sr-only">Website</dt>
                    <dd>
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-900 underline underline-offset-2 hover:no-underline break-all"
                      >
                        {displayUrl(website)}
                      </a>
                    </dd>
                  </div>
                )}
                {a.contact_email && (
                  <div>
                    <dt className="sr-only">Email</dt>
                    <dd>
                      <a
                        href={`mailto:${a.contact_email}`}
                        className="text-gray-700 hover:text-gray-900 break-all"
                      >
                        {a.contact_email}
                      </a>
                    </dd>
                  </div>
                )}
                {a.phone && (
                  <div>
                    <dt className="sr-only">Mobile phone</dt>
                    <dd>
                      <a href={`tel:${a.phone}`} className="text-gray-700 hover:text-gray-900">
                        {a.phone}
                      </a>
                      <span className="text-xs text-gray-400 ml-2">mobile</span>
                    </dd>
                  </div>
                )}
                {a.office_phone && (
                  <div>
                    <dt className="sr-only">Office phone</dt>
                    <dd>
                      <a
                        href={`tel:${a.office_phone}`}
                        className="text-gray-700 hover:text-gray-900"
                      >
                        {a.office_phone}
                      </a>
                      <span className="text-xs text-gray-400 ml-2">office</span>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {address && (
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

        {hasSocial && (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
              Follow
            </h2>
            <ul className="flex flex-wrap gap-2">
              {fb && <SocialPill href={fb} label="Facebook" />}
              {ig && <SocialPill href={ig} label="Instagram" />}
              {li && <SocialPill href={li} label="LinkedIn" />}
              {tw && <SocialPill href={tw} label="X" />}
              {yt && <SocialPill href={yt} label="YouTube" />}
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

function SocialPill({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-full hover:border-gray-500 hover:text-gray-900 transition-colors"
      >
        {label}
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
