// app/(public)/communities/[id]/page.tsx
//
// Public detail page for a single community row from builder_inventory
// (homeType='community'). Mirrors app/(public)/inventory/[id]/page.tsx
// so we get iOS-parity layout: gallery, about, stats grid, builder pill,
// plus the CommunityDetailFloater pill for Back / Website / Download /
// Share / Inventory.
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

// Strip common scraper markup / repeated boilerplate that leaks into the
// description field. Mirrors the helper in inventory/[id]/page.tsx.
function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  const trimmed = description
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

  const name = row.communityName || row.title;
  const cityLine = [row.city, row.state].filter(Boolean).join(', ');
  const price = formatPriceRange(row.priceMin, row.priceMax);
  const specs = formatBedBathSqft(row);
  const ready = row.readyDate ? formatDate(row.readyDate) : null;
  const builderSlug = builderNameToSlug(row.builderName);
  const cleanedDesc = cleanDescription(row.description);
  // Prefer a non-PDF page for the "Website" pill (a real destination);
  // only treat actual PDFs as the Download flyer. Mirrors inventory/[id].
  // David Weekley communities store their per-community page URL in
  // flyerPdfUrl, so this surfaces it as the Website link instead of a
  // misleading "Download".
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
  // When the scraper left no description (e.g. David Weekley communities,
  // whose per-community rows are pre-S13 orphans with description=null),
  // show a brief honest blurb so the page isn't an empty shell.
  const aboutDesc =
    cleanedDesc ??
    `New construction homes from ${row.builderName} in ${name}, ${cityLine}. View floor plans, pricing, and move-in ready inventory from the builder.`;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-32 pt-6 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Left: gallery + description */}
        <div className="lg:col-span-3">
          <InventoryGallery
            galleryUrls={row.galleryUrls}
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
        </div>

        {/* Right: builder pill + stats */}
        <aside className="lg:col-span-2">
          <Link
            href={`/builders/${builderSlug}`}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {row.builderName}
          </Link>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
            {name}
          </h1>

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
            {specs && (
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Specs</dt>
                <dd className="mt-0.5 font-medium text-neutral-900 dark:text-neutral-100">
                  {specs}
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
