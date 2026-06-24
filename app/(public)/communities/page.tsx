// app/(public)/communities/page.tsx
//
// Builder communities directory — Phase 2 redesign.
//
// Layout mirrors the iOS CommunitiesScreen.tsx:
//   - Optional builder eyebrow
//   - Headline + one-line lede
//   - Vertical list of BuilderInventoryRowCard rows
//
// Each market is standalone — the page is scoped to the active publication
// (cookie `caxton_pub`, set by the market picker). There is no aggregate
// view: Austin and San Antonio are separate products.
//
// Server component. Optional ?builder= filters to a single builder.

import { listBuilderInventory } from '@/lib/builder-inventory';
import { getServerPub } from '@/lib/publication';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builder Communities — Realty News Now',
  description:
    'New home communities and master-planned developments from local builders and developers.',
};

type PageProps = {
  searchParams: Promise<{ builder?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { builder } = await searchParams;
  const pub = await getServerPub();

  const rows = await listBuilderInventory({
    status: 'active',
    homeType: 'community',
    publication: pub,
    builderName: builder,
    limit: 200,
  });

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
              {builder ? `${builder} Communities` : 'New Home Communities'}
            </PageTitle>
            <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
              {builder
                ? `Active communities from ${builder}.`
                : 'Master-planned developments and active community listings from our builder partners.'}
            </p>
          </header>

          <AdSlot slug="featured_builder_strip" className="mb-4" />

          {rows.length === 0 ? (
            <EmptyState
              title="No communities yet"
              body={
                builder
                  ? `${builder} doesn't have any active communities listed right now.`
                  : "There aren't any active builder communities to show yet. Check back soon."
              }
            />
          ) : (
            <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
              {rows.map((r) => (
                <li key={r.id}>
                  <BuilderInventoryRowCard
                    row={r}
                    variant="community"
                    hideBuilderName={!!builder}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 px-6">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600 mt-2 max-w-md mx-auto">{body}</p>
    </div>
  );
}
