// app/(public)/inventory/page.tsx
//
// Builder move-in ready & promotions directory — Phase 2 redesign.
//
// NewHomeSource-style search filter UI lives in <InventoryBrowser>. The page
// is a thin server shell: it reads the URL search params (builder, beds,
// baths, price, city, promo, sort), parses them into an initial filter state
// via @/lib/inventory-filters, and hands that + the full active row set to
// the client browser. Filtering/sorting is 100% client-side so toggling is
// instant; the browser syncs changes back to the URL (replaceState) so a
// filtered view is shareable and the floater's Download-results button can
// append the same params to /api/inventory/pdf.
//
// Listings and promotions are fetched together and shown together (each card
// renders by its own row.kind). Each market is standalone — scoped to the
// active publication (cookie `caxton_pub`). Austin and San Antonio are
// separate products; there is no aggregate view.
//
// Server component. Inventory submission/detail flows remain at
// /inventory/submit and /inventory/[id]; those routes are untouched.

import { Suspense } from 'react';
import { listBuilderInventoryCached, type PromoType } from '@/lib/builder-inventory';
import { compactRow } from '@/lib/inventory-compact';
import { getServerPub } from '@/lib/publication';
import { matchesFilter, parseFilters, sortRows } from '@/lib/inventory-filters';
import InventoryBrowser from '@/components/inventory/InventoryBrowser';
import InventoryListSkeleton from '@/components/inventory/InventoryListSkeleton';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import { AdSlot } from '@/components/ads/AdSlot';
import BuilderDeveloperFloater from '@/components/builders/BuilderDeveloperFloater';

export const dynamic = 'force-dynamic';

const FIRST_SCREEN = 36;

export const metadata = {
  title: 'Move-in Ready Homes — Realty News Now',
  description:
    'Move-in ready homes from local builders and developers.',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Filters = ReturnType<typeof parseFilters>;

// Streams in after the page shell (breadcrumb, ad, floater) has painted.
async function HomesList({ filters, sort }: { filters: Filters['filters']; sort: Filters['sort'] }) {
  const initialFilters = { ...filters, kind: 'listing' as const };
  const pub = await getServerPub();
  // Fetch BOTH kinds (listings + promotions) for the active market. The
  // client browser filters by kind and every other dimension.
  const rows = await listBuilderInventoryCached({
    status: 'active',
    publication: pub,
    limit: 1000,
  });
  // Send only the first screenful (already filtered and sorted for this URL)
  // plus the filter menu options; the browser fetches the full compact set
  // from /api/inventory/browser once it is interactive.
  const first = sortRows(
    rows.filter((r) => matchesFilter(r, initialFilters)),
    sort,
  ).slice(0, FIRST_SCREEN);
  const facets = {
    builders: Array.from(new Set(rows.map((r) => r.builderName).filter(Boolean))).sort(),
    cities: Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(),
    promos: Array.from(
      new Set(rows.map((r) => r.promoType).filter((p): p is PromoType => !!p)),
    ).sort(),
  };
  return (
    <InventoryBrowser
      compactRows={first.map(compactRow)}
      facets={facets}
      lazyUrl="/api/inventory/browser"
      initialFilters={initialFilters}
      initialSort={sort}
      surface="inventory"
    />
  );
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const { filters: parsed, sort: initialSort } = parseFilters(params);

  return (
    <>
      <BuildersBreadcrumb />
      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-8">
          <AdSlot slug="featured_builder_strip" className="mb-4" />
          <Suspense fallback={<InventoryListSkeleton />}>
            <HomesList filters={parsed} sort={initialSort} />
          </Suspense>
        </div>
        <BuilderDeveloperFloater
          downloadHref="/api/inventory/pdf"
          backHref="/builders"
          page="inventory"
          shareTitle="Move-in Ready Homes — Realty News Now"
        />
      </div>
    </>
  );
}
