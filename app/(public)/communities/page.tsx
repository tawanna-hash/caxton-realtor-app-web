// app/(public)/communities/page.tsx
//
// Builder communities directory.
//
// Two modes:
//   - No ?builder=  → a list of ALL builders (mirrors the /builders hub card
//     layout), each linking to /communities?builder=<name> (that builder's
//     communities). This is the directory landing surface.
//   - ?builder=<name> → that builder's active community rows (the original
//     communities list view).
//
// Each market is standalone — scoped to the active publication (cookie
// `caxton_pub`). Austin and San Antonio are separate products; there is no
// aggregate view.
//
// Server component.

import Link from 'next/link';
import Image from 'next/image';
import { Building2, ChevronRight } from 'lucide-react';
import { listBuilderInventory } from '@/lib/builder-inventory';
import { summarizeBuilders } from '@/lib/builder-summary';
import { getServerPub } from '@/lib/publication';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import BuilderDeveloperFloater from '@/components/builders/BuilderDeveloperFloater';

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

  // Single-builder mode: show that builder's active communities.
  if (builder) {
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
              <div className="text-xs uppercase tracking-[0.18em] text-[#5a0e5f] font-medium">
                {builder}
              </div>
              <PageTitle size="md" className="mt-2">
                {builder} Communities
              </PageTitle>
              <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
                Active communities from {builder}.
              </p>
            </header>

            <AdSlot slug="featured_builder_strip" className="mb-4" />

            {rows.length === 0 ? (
              <EmptyState
                title="No communities yet"
                body={`${builder} doesn't have any active communities listed right now.`}
              />
            ) : (
              <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
                {rows.map((r) => (
                  <li key={r.id}>
                    <BuilderInventoryRowCard
                      row={r}
                      variant="community"
                      hideBuilderName
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <BuilderDeveloperFloater
            downloadHref="/api/communities/pdf"
            backHref="/communities"
            page="communities"
            shareTitle={`${builder} Communities — Realty News Now`}
          />
        </main>
      </>
    );
  }

  // Directory mode: list every builder, each linking to its communities.
  const rows = await listBuilderInventory({
    status: 'active',
    publication: pub,
    limit: 5000,
  });
  const builders = summarizeBuilders(rows);

  return (
    <>
      <BuildersBreadcrumb />
      <main className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
          <header className="mb-8">
            <PageTitle size="md">New Home Communities</PageTitle>
            <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
              Browse builders and developers, then tap through to their active
              communities and master-planned developments.
            </p>
          </header>

          <AdSlot slug="featured_builder_strip" className="mb-6" />

          {builders.length === 0 ? (
            <EmptyState
              title="No builders yet"
              body="There aren't any active builders to show yet. Check back soon."
            />
          ) : (
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-3">
                Builders
              </h2>
              <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
                {builders.map((b) => {
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
                        href={`/communities?builder=${encodeURIComponent(b.name)}`}
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
                              unoptimized
                            />
                          ) : (
                            <Building2
                              strokeWidth={1.5}
                              size={20}
                              className="text-gray-400"
                            />
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
            </section>
          )}
        </div>
        <BuilderDeveloperFloater
          downloadHref="/api/communities/pdf"
          backHref="/builders"
          page="communities"
          shareTitle="New Home Communities — Realty News Now"
        />
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
