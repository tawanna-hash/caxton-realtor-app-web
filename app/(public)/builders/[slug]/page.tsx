// app/(public)/builders/[slug]/page.tsx
//
// Per-builder detail page — Phase 2 redesign.
//
// Layout mirrors the iOS BuilderDetailScreen.tsx:
//   - Large title (builder name) + counts summary line
//   - Three sections in order: Communities / Move-in Ready / Promotions
//   - Each section shows up to PREVIEW rows then a "View all" link to
//     /communities or /inventory pre-filtered to ?builder=<name>
//
// Server component. Mounts a client <BuilderDetailFloater> at the bottom
// for Back / Download listings PDF / Share actions (see admin metrics
// surface pivot). /api/builders/[slug]/pdf serves the download.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';
import { listBuilderInventory, type BuilderInventoryRow } from '@/lib/builder-inventory';
import { summarizeBuilders } from '@/lib/builder-summary';
import { slugToBuilderName } from '@/lib/builder-slug-server';
import { getServerPub } from '@/lib/publication';
import BuilderInventoryRowCard from '@/components/builders/BuilderInventoryRowCard';
import BuilderDetailFloater from '@/components/builders/BuilderDetailFloater';

export const dynamic = 'force-dynamic';

const PREVIEW = 4;

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const builderName = await slugToBuilderName(slug);
  if (!builderName) return { title: 'Builder not found — Realty News Now' };
  return {
    title: `${builderName} — Realty News Now`,
    description: `Communities, move-in ready homes, and promotions from ${builderName}.`,
  };
}

type Bucketed = {
  communities: BuilderInventoryRow[];
  listings: BuilderInventoryRow[];
  promotions: BuilderInventoryRow[];
};

function pickBuilderWebsiteUrl(rows: BuilderInventoryRow[]): string | null {
  const isPdf = (u: string | null | undefined) =>
    !!u && u.toLowerCase().endsWith('.pdf');
  for (const r of rows) {
    if (r.sourceUrl && !isPdf(r.sourceUrl)) return r.sourceUrl;
  }
  return null;
}

function bucketRows(rows: BuilderInventoryRow[]): Bucketed {
  const out: Bucketed = { communities: [], listings: [], promotions: [] };
  for (const r of rows) {
    if (r.kind === 'promotion') out.promotions.push(r);
    else if (r.homeType === 'community') out.communities.push(r);
    else out.listings.push(r);
  }
  return out;
}

function summarize(b: Bucketed, subBuilderCount = 0): string {
  const parts: string[] = [];
  if (b.communities.length)
    parts.push(
      `${b.communities.length} ${
        b.communities.length === 1 ? 'community' : 'communities'
      }`,
    );
  if (subBuilderCount)
    parts.push(`${subBuilderCount} ${subBuilderCount === 1 ? 'builder' : 'builders'}`);
  if (b.listings.length) parts.push(`${b.listings.length} move-in ready`);
  if (b.promotions.length)
    parts.push(
      `${b.promotions.length} ${
        b.promotions.length === 1 ? 'promotion' : 'promotions'
      }`,
    );
  return parts.join(' · ');
}

function extractSubBuilders(
  rows: BuilderInventoryRow[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.developerName && r.builderName && r.builderName !== r.developerName) {
      const bn = r.builderName.trim();
      counts.set(bn, (counts.get(bn) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const builderName = await slugToBuilderName(slug);
  if (!builderName) {
    notFound();
  }

  // Each market is standalone — scope to the active publication only.
  const pub = await getServerPub();
  // Query by developerName first (covers developers like Santa Rita Ranch
  // whose showcase homes have builderName = actual builder). Fall back to
  // builderName for standalone builders without a developer.
  const rows = await listBuilderInventory({
    status: 'active',
    developerName: builderName,
    publication: pub,
    limit: 500,
  });
  // If no developer results, try builderName directly.
  const finalRows = rows.length > 0
    ? rows
    : await listBuilderInventory({
        status: 'active',
        builderName,
        publication: pub,
        limit: 500,
      });
  const bucketed = bucketRows(finalRows);
  const total =
    bucketed.communities.length +
    bucketed.listings.length +
    bucketed.promotions.length;

  // Single source of truth, shared with the /builders list page: an entity is
  // a developer only when rows exist that name it as their developer. A row's
  // own developerName is a parent pointer, so it says nothing about this page.
  const isDeveloper =
    summarizeBuilders(finalRows).find(
      (s) => s.name.trim().toLowerCase() === builderName.trim().toLowerCase(),
    )?.isDeveloper ?? false;

  // Sub-builders (e.g. Perry Homes, Pulte, etc. under SRR) exist only beneath
  // a developer. Gating on isDeveloper keeps stray developerName values on a
  // builder's own rows from inventing a sub-builder list.
  const subBuilders = isDeveloper ? extractSubBuilders(finalRows) : [];

  // Pick the builder's website URL from the first inventory row that has a
  // non-PDF source_url (the actual community/listing page on the builder's
  // site). Powers the "Website" pill in the floater.
  const websiteUrl = pickBuilderWebsiteUrl(finalRows);

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-[0.18em] text-gray-500 font-medium">
            {isDeveloper ? 'Developer' : 'Builder'}
          </div>
          <PageTitle size="md" className="mt-2">
            {builderName}
          </PageTitle>
          {total > 0 ? (
            <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
              {summarize(bucketed, subBuilders.length)}
            </p>
          ) : (
            <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
              Nothing listed for {builderName} yet.
            </p>
          )}
        </header>

        {total === 0 && (
          <div className="text-center py-12 px-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              There aren&apos;t any communities, move-in ready homes, or active
              promotions from this builder right now.
            </p>
          </div>
        )}

        <PreviewSection
          title="Communities"
          rows={bucketed.communities}
          builderName={builderName}
          emptyLabel="No active communities."
          variant="community"
          viewAllHref={`/communities?builder=${encodeURIComponent(builderName)}`}
        />

        {subBuilders.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Builders</h2>
              <span className="text-sm text-gray-500">{subBuilders.length} builders</span>
            </div>
            <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
              {subBuilders.map((b) => (
                <li key={b.name}>
                  <Link
                    href={`/inventory?kind=listing&builder=${encodeURIComponent(b.name)}`}
                    className="flex items-center justify-between py-3 group hover:bg-gray-50 transition-colors -mx-2 px-2 rounded-md"
                  >
                    <span className="text-base font-medium text-gray-900">{b.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{b.count} homes</span>
                      <ArrowRight strokeWidth={1.75} size={14} className="text-gray-400 group-hover:text-gray-700 transition-colors" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <PreviewSection
          title="Move-in Ready"
          rows={bucketed.listings}
          builderName={builderName}
          emptyLabel="No move-in ready homes."
          variant="listing"
          viewAllHref={`/inventory?kind=listing&developer=${encodeURIComponent(builderName)}`}
        />

        <PreviewSection
          title="Promotions"
          rows={bucketed.promotions}
          builderName={builderName}
          emptyLabel="No active promotions."
          variant="promotion"
          viewAllHref={`/inventory?kind=promotion&developer=${encodeURIComponent(builderName)}`}
        />
      </div>

      <BuilderDetailFloater builderName={builderName} slug={slug} websiteUrl={websiteUrl} />
    </main>
  );
}

function PreviewSection({
  title,
  rows,
  emptyLabel,
  variant,
  viewAllHref,
}: {
  title: string;
  rows: BuilderInventoryRow[];
  builderName: string;
  emptyLabel: string;
  variant: 'community' | 'listing' | 'promotion';
  viewAllHref: string;
}) {
  // Hide entire section when this builder has nothing of this type AND no
  // other section is empty either — keeps the page short. We render with a
  // small "Nothing here" line only when at least one of the other buckets
  // does have content, so we always show the section header for context.
  // (Simpler rule: always render; show emptyLabel when rows is empty.)
  const previewed = rows.slice(0, PREVIEW);
  const hasMore = rows.length > PREVIEW;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">{title}</h2>
        {hasMore && (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-[#7B5BC4] transition-colors"
          >
            View all
            <ArrowRight strokeWidth={1.75} size={14} />
          </Link>
        )}
      </div>
      {previewed.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {previewed.map((r) => (
            <li key={r.id}>
              <BuilderInventoryRowCard row={r} variant={variant} hideBuilderName />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
