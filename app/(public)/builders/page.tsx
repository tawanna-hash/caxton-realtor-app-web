// app/(public)/builders/page.tsx
//
// Builders & Developers hub — Phase 2 redesign.
//
// Layout mirrors the iOS BuildersScreen.tsx:
//   1. Eyebrow + headline + lede
//   2. AdSlot strip (featured_builder_strip — kept from old design)
//   3. Three quick-link rows: Communities / Move-in Ready / Promotions
//   4. List of builder cards, each linking to /builders/[slug]
//
// Server component. Aggregates rows via summarizeBuilders() so the list is
// always in sync with /api/builders and the native iOS Builders screen.

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, ChevronRight } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import { listBuilderInventoryCached } from '@/lib/builder-inventory';
import { summarizeBuilders } from '@/lib/builder-summary';
import { getServerPub } from '@/lib/publication';
import BuilderDeveloperFloater from '@/components/builders/BuilderDeveloperFloater';
import { canOptimizeImage } from '@/lib/optimizable-image-hosts';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builders & Developers — Realty News Now',
  description:
    'New home communities, move-in ready homes, and promotions from local builders and developers.',
};

async function BuildersContent() {
  // Each market is standalone — scope to the active publication only.
  const pub = await getServerPub();
  const rows = await listBuilderInventoryCached({
    status: 'active',
    publication: pub,
    limit: 5000,
  });
  const builders = summarizeBuilders(rows);
  const developers = builders.filter((b) => b.isDeveloper);
  const buildersOnly = builders.filter((b) => !b.isDeveloper);

  const renderList = (list: typeof builders) =>
    list.length > 0 && (
      <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
        {list.map((b) => {
          const countsParts: string[] = [];
          if (b.communitiesCount)
            countsParts.push(
              `${b.communitiesCount} ${
                b.communitiesCount === 1 ? 'community' : 'communities'
              }`,
            );
          if (b.inventoryCount)
            countsParts.push(`${b.inventoryCount} move-in ready`);
          if (b.promotionsCount)
            countsParts.push(
              `${b.promotionsCount} ${
                b.promotionsCount === 1 ? 'promo' : 'promos'
              }`,
            );
          const counts = countsParts.join(' · ');
          const cities = b.cities.slice(0, 3).join(', ');

          return (
            <li key={b.slug}>
              <Link
                href={`/builders/${b.slug}`}
                className="flex items-center gap-4 py-4 group hover:bg-gray-50 transition-colors -mx-2 px-2 rounded-md"
              >
                <div className="relative flex-shrink-0 w-14 h-14 rounded-md bg-gray-50 overflow-hidden flex items-center justify-center">
                  {b.thumbnailUrl ? (
                    <Image
                      src={b.thumbnailUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                      unoptimized={!canOptimizeImage(b.thumbnailUrl)}
                    />
                  ) : (
                    <Building2 strokeWidth={1.5} size={20} className="text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-gray-900 truncate">
                    {b.name}
                  </div>
                  {counts && (
                    <div className="text-sm text-gray-600 truncate mt-0.5">
                      {counts}
                    </div>
                  )}
                  {cities && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">
                      {cities}
                    </div>
                  )}
                </div>
                <ChevronRight
                  strokeWidth={1.75}
                  size={18}
                  className="flex-shrink-0 text-gray-400 group-hover:text-gray-700 transition-colors"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    );

  return (
    <>
        {developers.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
              Developers
            </h2>
            {renderList(developers)}
          </section>
        )}

        {buildersOnly.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
              Builders
            </h2>
            {renderList(buildersOnly)}
          </section>
        )}
    </>
  );
}

export default function BuildersHubPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8">
          <Link
            href="/advertisers"
            className="inline-block text-sm uppercase tracking-[0.2em] text-gray-500 hover:text-gray-900 font-medium mb-2 transition-colors"
          >
            Partners
          </Link>
          <PageTitle size="md">Builders &amp; Developers</PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            Explore communities, move-in ready homes, and current promotions
            from our builder and developer partners.
          </p>
        </header>

        <AdSlot slug="featured_builder_strip" className="mb-6" />

        <Suspense
          fallback={
            <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading builders">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3 border-b border-gray-100">
                  <div className="w-12 h-12 rounded-md bg-gray-100 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 rounded bg-gray-200" />
                    <div className="h-3 w-1/3 rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          }
        >
          <BuildersContent />
        </Suspense>
      </div>
      <BuilderDeveloperFloater
        downloadHref="/api/inventory/pdf"
        backHref="/builders"
        page="builders"
        shareTitle="Builders & Developers — Realty News Now"
      />
    </main>
  );
}
