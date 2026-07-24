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

import { listBuilderInventory } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
import { parseFilters } from '@/lib/inventory-filters';
import InventoryBrowser from '@/components/inventory/InventoryBrowser';
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

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const { filters: parsed, sort: initialSort } = parseFilters(params);
  // /promotions is the dedicated Promotions page — force kind=promotion
  // server-side so the page is always scoped to promotions (the ?kind=
  // deep link is normalized away on mount by InventoryBrowser).
  const initialFilters = { ...parsed, kind: 'promotion' as const };
  const pub = await getServerPub();

  // Fetch BOTH kinds (listings + promotions) for the active market. The
  // client browser filters to promotions (kind) + every other dimension.
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
            surface="promotions"
          />
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
