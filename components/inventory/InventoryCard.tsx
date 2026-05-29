'use client';

import type { BuilderInventoryRow, Kind } from '@/lib/builder-inventory';
import { trackEvent } from '@/app/posthog-provider';

type Props = {
  row: BuilderInventoryRow;
};

const KIND_BADGE_STYLE: Record<Kind, string> = {
  listing: 'border-emerald-200 bg-emerald-50 text-emerald-800 rounded-md',
  promotion: 'border-amber-200 bg-amber-50 text-amber-800 rounded-md',
};

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString('en-US')}`;
}

function formatPriceRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${fmtCurrency(min)} – ${fmtCurrency(max)}`;
  return fmtCurrency((min ?? max)!);
}

function formatNumRange(
  min: number | null,
  max: number | null,
  unit: string,
): string | null {
  if (!min && !max) return null;
  const lo = min ?? max!;
  const hi = max ?? min!;
  if (lo === hi) return `${lo} ${unit}`;
  return `${lo}–${hi} ${unit}`;
}

function formatExpires(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Through ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// S13: Deterministic gallery image picker. When a row has a multi-image
// gallery (KB Home — multiple collections share one community URL, so
// without this they'd all render the same hero), pick one consistently
// based on row.id. Same card always shows the same image (no flicker on
// re-render), different cards get different images. Falls back to
// thumbnailUrl when gallery_urls is null/empty (DW, M/I, Giddens).
function pickCardImage(row: { id: number; externalId: string | null; thumbnailUrl: string | null; galleryUrls: string[] | null }): string | null {
  const gallery = row.galleryUrls;
  if (gallery && gallery.length >= 2) {
    // djb2 hash of externalId (string) — much better distribution than
    // hashing the sequential numeric id, which can collide for cards
    // created in sequence (e.g., Watermill Heritage/Hallmark/Classic).
    // Falls back to id-based hash when externalId is null (legacy rows).
    const key = row.externalId ?? String(row.id);
    let h = 5381;
    for (let i = 0; i < key.length; i++) {
      h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(h) % gallery.length;
    return gallery[idx] ?? gallery[0] ?? row.thumbnailUrl;
  }
  return row.thumbnailUrl;
}

export default function InventoryCard({ row }: Props) {
  const priceRange = formatPriceRange(row.priceMin, row.priceMax);
  const bedsRange = formatNumRange(row.bedsMin, row.bedsMax, 'bd');
  const bathsRange = formatNumRange(row.bathsMin, row.bathsMax, 'ba');
  const sqftRange = formatNumRange(row.sqftMin, row.sqftMax, 'sqft');
  const expiresLabel = formatExpires(row.expiresAt);

  const handleClick = () => {
    // Promotions: open the builder's authoritative source page (legal text lives there)
    // Listings:   open the flyer PDF if present
    const target = row.flyerPdfUrl ?? row.sourceUrl;
    const destination = row.flyerPdfUrl ? 'flyer' : (row.sourceUrl ? 'source' : 'none');
    trackEvent('inventory_card_clicked', {
      row_id: row.id,
      kind: row.kind,
      builder_name: row.builderName,
      publication: row.publication,
      destination,
    });
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="group flex flex-col border border-gray-200 bg-white hover:border-gray-400 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 rounded-md overflow-hidden"
    >
      {/* Thumbnail */}
      <div className={`relative ${row.kind === 'promotion' ? 'aspect-video' : 'aspect-[3/4]'} bg-gray-100 overflow-hidden`}>
        {(() => {
          const imgSrc = pickCardImage(row);
          return imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={`${row.builderName} — ${row.title}`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </div>
          );
        })()}

        {/* Top-right badge.
            Listings now show the city instead of the generic "Listing" label
            — much more useful at-a-glance when scanning a grid of cards.
            Promotions keep the "Promotion" label since they aren't
            geographically scoped to a single city the way a community or
            move-in-ready home is. Falls back to the kind label when city
            happens to be empty (defensive — every scraped row has a city). */}
        <div className="absolute top-2 right-2">
          <span
            className={`inline-block text-[10px] uppercase tracking-[0.1em] font-medium px-2 py-1 border ${KIND_BADGE_STYLE[row.kind]}`}
          >
            {row.kind === 'listing'
              ? (row.city?.trim() || 'Listing')
              : 'Promotion'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col px-4 py-4 gap-1.5">
        <p className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium">
          {row.builderName}
        </p>
        <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 group-hover:underline underline-offset-2 decoration-1">
          {row.title}
        </h3>
        <p className="text-sm text-gray-600 font-light">
          {row.city}, {row.state}
        </p>

        {/* Kind-specific details */}
        <div className="mt-1 text-sm text-gray-700 font-light leading-relaxed">
          {row.kind === 'listing' && (
            <>
              {priceRange && <p className="font-medium text-gray-900">{priceRange}</p>}
              {(bedsRange || bathsRange || sqftRange) && (
                <p className="text-gray-600">
                  {[bedsRange, bathsRange, sqftRange].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
          {row.kind === 'promotion' && (
            <>
{expiresLabel && <p className="text-gray-600">{expiresLabel}</p>}
            </>
          )}
        </div>
      </div>
    </article>
  );
}
