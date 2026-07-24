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

import { listBuilderInventory } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
import { parseFilters } from '@/lib/inventory-filters';
import InventoryBrowser from '@/components/inventory/InventoryBrowser';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import { AdSlot } from '@/components/ads/AdSlot';
import BuilderDeveloperFloater from '@/components/builders/BuilderDeveloperFloater';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Move-in Ready & Promotions — Realty News Now',
  description:
    'Move-in ready homes and current promotions from local builders and developers.',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const { filters: initialFilters, sort: initialSort } = parseFilters(params);
  const pub = await getServerPub();

  // Fetch BOTH kinds (listings + promotions) for the active market. The
  // client browser filters everything — including builder — so we don't
  // server-scope by ?builder= here; ?builder= just seeds the dropdown.
  const rows = await listBuilderInventory({
    status: 'active',
    publication: pub,
    limit: 1000,
  });

  return (
    <>
      <BuildersBreadcrumb />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
          <AdSlot slug="featured_builder_strip" className="mb-4" />
          <InventoryBrowser
            rows={rows}
            initialFilters={initialFilters}
            initialSort={initialSort}
          />
        </div>
        <BuilderDeveloperFloater
          downloadHref="/api/inventory/pdf"
          backHref="/inventory"
          page="inventory"
          shareTitle="Move-in Ready & Promotions — Realty News Now"
        />
      </main>
    </>
  );
}
