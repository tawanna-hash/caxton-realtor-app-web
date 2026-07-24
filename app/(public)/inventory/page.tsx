// app/(public)/inventory/page.tsx
//
// Builder move-in ready & promotions directory — Phase 2 redesign.
//
// Layout mirrors the iOS InventoryScreen.tsx, now with a NewHomeSource-style
// search filter UI (InventoryBrowser): Beds / Baths / Price range / Builder /
// City / Promo-type / Sort, all client-side so toggling is instant.
//
// The page fetches BOTH kinds (listings + promotions) server-side and hands
// them to the client browser, which owns the kind tabs + every filter.
// ?kind= and ?builder= still work as deep links (initial state seeds the
// browser). Each market is standalone — scoped to the active publication
// (cookie `caxton_pub`, set by the market picker). Austin and San Antonio
// are separate products; there is no aggregate view.
//
// Server component. Inventory submission/detail flows remain at
// /inventory/submit and /inventory/[id]; those routes are untouched.

import { listBuilderInventory, type Kind } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
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

function normalizeKind(raw: string | undefined): Kind {
  return raw === 'promotion' ? 'promotion' : 'listing';
}

type PageProps = {
  searchParams: Promise<{ kind?: string; builder?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const initialKind = normalizeKind(params.kind);
  const builder = params.builder;
  const pub = await getServerPub();

  // Fetch BOTH kinds so the client browser can toggle Move-in Ready ↔
  // Promotions without a full reload. limit 1000 covers the combined set.
  const rows = await listBuilderInventory({
    status: 'active',
    publication: pub,
    builderName: builder,
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
            initialKind={initialKind}
            builder={builder ?? null}
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
