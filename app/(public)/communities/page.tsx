// app/(public)/communities/page.tsx
//
// Builder communities directory — Phase 2 redesign.
//
// Layout mirrors the iOS CommunitiesScreen.tsx:
//   - Eyebrow row (publication, optionally builder)
//   - One-line lede
//   - Vertical list of BuilderInventoryRowCard rows
//
// Server component. Optional ?builder= filters to a single builder.
// Optional ?pub= scopes the publication; defaults to 'both' so the directory
// surfaces every active community across Austin + San Antonio.

import { listBuilderInventory, type Publication } from '@/lib/builder-inventory';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builder Communities — Realty News Now',
  description:
    'New home communities and master-planned developments from Austin and San Antonio builders and developers.',
};

const PUB_LABEL: Record<Publication, string> = {
  realtyline: 'RealtyLine Austin',
  newsline: 'Newsline San Antonio',
  'realtyline-houston': 'RealtyLine Houston',
  'realtyline-dallas': 'RealtyLine Dallas/FTW',
  both: 'Austin & San Antonio',
};

function normalizePub(raw: string | undefined): Publication {
  switch (raw) {
    case 'realtyline':
    case 'newsline':
    case 'realtyline-houston':
    case 'realtyline-dallas':
    case 'both':
      return raw;
    case 'austin':
      return 'realtyline';
    case 'san_antonio':
      return 'newsline';
    default:
      return 'both';
  }
}

type PageProps = {
  searchParams: Promise<{ builder?: string; pub?: string }>;
};

export default async function Page({ searchParams }: PageProps) {
  const { builder, pub: pubRaw } = await searchParams;
  const pub = normalizePub(pubRaw);

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
            <div className="text-xs uppercase tracking-[0.18em] text-gray-500 font-medium">
              {builder ? `${PUB_LABEL[pub]} · ${builder}` : PUB_LABEL[pub]}
            </div>
            <PageTitle size="md" className="mt-2">
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
