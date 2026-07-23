// app/(public)/inventory/page.tsx
//
// Builder move-in ready & promotions directory — Phase 2 redesign.
//
// Layout mirrors the iOS InventoryScreen.tsx:
//   - Title swaps based on ?kind=listing|promotion (defaults to listing)
//   - Optional ?builder= filters to a single builder
//
// Each market is standalone — the page is scoped to the active publication
// (cookie `caxton_pub`, set by the market picker). There is no aggregate
// view: Austin and San Antonio are separate products.
//
// Server component. Inventory submission/detail flows remain at
// /inventory/submit and /inventory/[id]; those routes are untouched.

import { listBuilderInventory, type Kind } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import PageTitle from '@/components/ui/PageTitle';
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
  const kind = normalizeKind(params.kind);
  const builder = params.builder;
  const pub = await getServerPub();

  const rows = await listBuilderInventory({
    status: 'active',
    kind,
    publication: pub,
    builderName: builder,
    limit: 500,
  });

  const heading = kind === 'promotion' ? 'Promotions' : 'Move-in Ready Homes';

  return (
    <>
      <BuildersBreadcrumb />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
          <header className="mb-6">
            {builder && (
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500 font-medium">
                {builder}
              </div>
            )}
            <PageTitle size="md" className={builder ? 'mt-2' : ''}>
              {builder ? `${builder} ${heading}` : heading}
            </PageTitle>
            <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
              {kind === 'promotion'
                ? builder
                  ? `Current promotions from ${builder}.`
                  : 'Current incentives, rate buy-downs, and limited-time offers from our builder partners.'
                : builder
                  ? `Move-in ready homes available now from ${builder}.`
                  : 'Specific homes available now from builder partners.'}
            </p>
          </header>

          <AdSlot slug="featured_builder_strip" className="mb-4" />

          {rows.length === 0 ? (
            <EmptyState
              kind={kind}
              builder={builder ?? null}
            />
          ) : (
            <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
              {rows.map((r) => (
                <li key={r.id}>
                  <BuilderInventoryRowCard
                    row={r}
                    variant={kind === 'promotion' ? 'promotion' : 'listing'}
                    hideBuilderName={!!builder}
                  />
                </li>
              ))}
            </ul>
          )}
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

function EmptyState({ kind, builder }: { kind: Kind; builder: string | null }) {
  const title =
    kind === 'promotion' ? 'No active promotions' : 'No move-in ready homes';
  const body = builder
    ? kind === 'promotion'
      ? `${builder} doesn't have any active promotions right now.`
      : `${builder} doesn't have any move-in ready homes listed right now.`
    : kind === 'promotion'
      ? "There aren't any active builder promotions to show right now."
      : "There aren't any move-in ready builder homes to show right now.";
  return (
    <div className="text-center py-16 px-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">{body}</p>
    </div>
  );
}
