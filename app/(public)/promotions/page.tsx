// app/(public)/promotions/page.tsx
//
// Dedicated Promotions directory — the promotions-only counterpart to
// /inventory (Move-in Ready Homes). Both share the same <InventoryBrowser>
// search UI and the same @/lib/inventory-filters filter logic; this page
// just forces kind='promotion' server-side so only promotions render.
//
// Mirrors /inventory's server shell: parse URL search params, fetch all
// active rows for the active market, hand them + the forced kind to the
// client browser (which filters/sorts client-side and syncs back to the
// URL so a filtered view is shareable + downloadable via the floater).
// Each market is standalone — scoped to the active publication (cookie
// `caxton_pub`). Austin and San Antonio are separate products.

import { Suspense } from 'react';
import { listBuilderInventoryCached, toBrowserRow } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
import { parseFilters } from '@/lib/inventory-filters';
import InventoryBrowser from '@/components/inventory/InventoryBrowser';
import InventoryListSkeleton from '@/components/inventory/InventoryListSkeleton';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import { AdSlot } from '@/components/ads/AdSlot';
import BuilderDeveloperFloater from '@/components/builders/BuilderDeveloperFloater';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Promotions — Realty News Now',
  description:
    'Current promotions and incentives from local builders and developers.',
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Filters = ReturnType<typeof parseFilters>;

// Streams in after the page shell (breadcrumb, ad, floater) has painted.
async function HomesList({ filters, sort }: { filters: Filters['filters']; sort: Filters['sort'] }) {
  const initialFilters = { ...filters, kind: 'promotion' as const };
  const pub = await getServerPub();
  // Fetch BOTH kinds (listings + promotions) for the active market. The
  // client browser filters by kind and every other dimension.
  const rows = await listBuilderInventoryCached({
    status: 'active',
    publication: pub,
    limit: 1000,
  });
  return (
    <InventoryBrowser
      rows={rows.map(toBrowserRow)}
      initialFilters={initialFilters}
      initialSort={sort}
      surface="promotions"
    />
  );
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const { filters: parsed, sort: initialSort } = parseFilters(params);

  return (
    <>
      <BuildersBreadcrumb />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-8">
          <AdSlot slug="featured_builder_strip" className="mb-4" />
          <Suspense fallback={<InventoryListSkeleton />}>
            <HomesList filters={parsed} sort={initialSort} />
          </Suspense>
        </div>
        <BuilderDeveloperFloater
          downloadHref="/api/inventory/pdf"
          backHref="/builders"
          page="promotions"
          shareTitle="Promotions — Realty News Now"
        />
      </main>
    </>
  );
}
