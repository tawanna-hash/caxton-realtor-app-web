'use client';

// components/builders/BuilderInventoryRowCard.tsx
//
// iOS-style list row used by the new /communities, /inventory, and
// /builders/[slug] pages. Mirrors the React Native rows in
// CommunitiesScreen.tsx + InventoryScreen.tsx for visual parity.
//
// Click semantics:
//   - If the row has a sourceUrl, open it in a new tab (matches iOS behavior
//     of opening Linking.openURL externally).
//   - Otherwise navigate to /builders/[slug] for the row's builder.
//
// PostHog tracking fires on every click so we keep analytics on these pages.

import Link from 'next/link';
import Image from 'next/image';
import { Building2, Home, Tag } from 'lucide-react';
import type { BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';
import { trackEvent } from '@/app/posthog-provider';
import {
  formatPriceRange,
  formatBedBathSqft,
  formatDate,
} from '@/lib/builder-format';

type Variant = 'community' | 'listing' | 'promotion';

type Props = {
  row: BuilderInventoryRow;
  variant: Variant;
  /** When true the builder name is hidden (drilled-in to a single builder). */
  hideBuilderName?: boolean;
};

const ICON_FOR: Record<Variant, typeof Home> = {
  community: Building2,
  listing: Home,
  promotion: Tag,
};

export default function BuilderInventoryRowCard({
  row,
  variant,
  hideBuilderName,
}: Props) {
  const Icon = ICON_FOR[variant];
  const price = formatPriceRange(row.priceMin, row.priceMax);
  const specs = formatBedBathSqft(row);
  const cityLine = [row.city, row.state].filter(Boolean).join(', ');

  const expiresLine =
    variant === 'promotion' && row.expiresAt
      ? `Ends ${formatDate(row.expiresAt)}`
      : row.readyDate
        ? `Ready ${formatDate(row.readyDate)}`
        : '';

  const title = variant === 'community' ? row.communityName || row.title : row.title;

  // Destination logic:
  //   - community variant: go to /communities/[id] (internal detail page
  //     with floater pill for back/website/download/share/inventory).
  //   - listing variant (move-in-ready homes): go to /inventory/[id]
  //     (internal detail page with photo gallery, specs, marketing
  //     description, and a Builder Site pill that opens the builder's site).
  //     Do NOT bounce the user straight to the builder's website.
  //   - promotion: link to the actual listing on the builder's site. Prefer
  //     a non-PDF sourceUrl; otherwise fall back to a non-PDF flyerPdfUrl.
  //     If only a PDF or nothing is available, route to the builder profile.
  const isPdf = (u: string | null | undefined) =>
    !!u && u.toLowerCase().endsWith('.pdf');
  const communityHref = `/communities/${row.id}`;
  const listingHref = `/inventory/${row.id}`;
  const externalUrl =
    variant === 'community' || variant === 'listing'
      ? null
      : (row.sourceUrl && !isPdf(row.sourceUrl)
            ? row.sourceUrl
            : row.flyerPdfUrl && !isPdf(row.flyerPdfUrl)
              ? row.flyerPdfUrl
              : null) ?? null;
  const href =
    variant === 'community'
      ? communityHref
      : variant === 'listing'
        ? listingHref
        : externalUrl || `/builders/${builderNameToSlug(row.builderName)}`;
  const external = !!externalUrl;

  const onClick = () => {
    trackEvent('builder_row_card_clicked', {
      row_id: row.id,
      variant,
      builder_name: row.builderName,
      has_source_url: external,
    });
  };

  const linkProps = external
    ? { href, target: '_blank' as const, rel: 'noopener noreferrer' }
    : { href };

  return (
    <Link
      {...linkProps}
      onClick={onClick}
      className="flex gap-4 py-4 group hover:bg-gray-50 transition-colors -mx-2 px-2 rounded-md"
    >
      <div className="relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-md bg-gray-50 overflow-hidden flex items-center justify-center">
        {row.thumbnailUrl ? (
          <Image
            src={row.thumbnailUrl}
            alt=""
            fill
            sizes="96px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <Icon strokeWidth={1.5} size={22} className="text-gray-400" />
        )}
        {row.featured ? (
          <span className="absolute top-1 left-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-brand-700 text-white">
            Featured
          </span>
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        {!hideBuilderName && (
          <div className="text-[11px] uppercase tracking-[0.12em] text-gray-500 font-medium truncate">
            {row.builderName}
          </div>
        )}
        <div className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 mt-0.5">
          {title}
        </div>
        {variant !== 'community' && row.communityName && row.communityName !== title ? (
          <div className="text-sm text-gray-500 truncate mt-0.5">{row.communityName}</div>
        ) : null}
        {cityLine && (
          <div className="text-sm text-gray-500 truncate mt-0.5">{cityLine}</div>
        )}
        {price && (
          <div className="text-sm font-semibold text-gray-900 mt-0.5">{price}</div>
        )}
        {specs && (
          <div className="text-sm text-gray-600 truncate mt-0.5">{specs}</div>
        )}
        {expiresLine && (
          <div className="text-sm text-gray-600 mt-0.5">{expiresLine}</div>
        )}
      </div>
    </Link>
  );
}
