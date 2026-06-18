// app/(public)/inventory/[id]/page.tsx
//
// Public detail page for a single inventory row (listing or promotion).
//
// Server-rendered from `builder_inventory.id`. Shows:
//   - Photo gallery (galleryUrls + thumbnail fallback)
//   - Title / builder pill / community link / location
//   - Price (with min/max range when set)
//   - Stats grid: beds, baths, sqft, garage (parsed from description), ready date
//   - Marketing description
//   - Action buttons: source URL / flyer PDF
//
// Only rows with status='active' are shown publicly; anything else
// renders the 404 page so unpublished drafts don't leak.

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { notFound } from 'next/navigation';
import { getBuilderInventoryById, type BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';
import InventoryGallery from '@/components/inventory/InventoryGallery';
import InventoryDetailFloater from '@/components/inventory/InventoryDetailFloater';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

// ───────────────────────────────────────────────────────── helpers ────────

function fmtPrice(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}

function formatPriceRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) {
    return `${fmtPrice(min)} – ${fmtPrice(max)}`;
  }
  return fmtPrice((min ?? max) as number);
}

function formatNumRange(min: number | null, max: number | null, unit: string): string | null {
  if (min == null && max == null) return null;
  const lo = (min ?? max) as number;
  const hi = (max ?? min) as number;
  if (lo === hi) return `${lo} ${unit}`;
  return `${lo}–${hi} ${unit}`;
}

function formatReadyDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatExpires(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same trailing "— Builder" extraction used by InventoryCard. When the
// builder_name is a master-planned developer (Santa Rita Ranch, La Cima),
// the actual home builder appears as a suffix in the title.
function extractEmbeddedBuilder(title: string): string | null {
  const m = title.match(/\s+[\u2014\u2013-]\s+([^\u2014\u2013-]+?)\s*$/);
  return m ? m[1].trim() : null;
}

const MASTER_PLANNED_DEVELOPERS = new Set(['Santa Rita Ranch', 'La Cima']);

// Pull "X-car garage" out of the description, if present, so we can
// surface it in the stats grid without needing a new schema column.
function parseGarage(description: string | null): string | null {
  if (!description) return null;
  const m = description.match(/(\d+)-car garage/i);
  return m ? `${m[1]}-car garage` : null;
}

// Some scrapers include a leading "Built by <Builder>." sentence in
// the description for clarity in the card. The detail page already
// shows the builder prominently, so strip that to avoid duplication.
function cleanDescription(description: string | null): string | null {
  if (!description) return null;
  return description
    .replace(/^Built by [^.]+\.\s*/, '')
    .trim() || null;
}

// ─────────────────────────────────────────────────────── rendering ────────

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) return { title: 'Listing not found' };
  const row = await getBuilderInventoryById(numericId);
  if (!row || row.status !== 'active') return { title: 'Listing not found' };

  const priceLabel = formatPriceRange(row.priceMin, row.priceMax);
  const titleParts = [row.title, priceLabel, `${row.city}, ${row.state}`].filter(Boolean);
  return {
    title: `${row.title} — ${row.builderName} — Realty News Now`,
    description: titleParts.join(' · '),
    openGraph: {
      title: row.title,
      description: row.description ?? `${row.builderName} — ${row.city}, ${row.state}`,
      images: row.thumbnailUrl ? [{ url: row.thumbnailUrl }] : undefined,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const row = await getBuilderInventoryById(numericId);
  if (!row || row.status !== 'active') notFound();

  return <DetailView row={row} />;
}

function DetailView({ row }: { row: BuilderInventoryRow }) {
  const priceRange = formatPriceRange(row.priceMin, row.priceMax);
  const bedsRange = formatNumRange(row.bedsMin, row.bedsMax, 'bd');
  const bathsRange = formatNumRange(row.bathsMin, row.bathsMax, 'ba');
  const sqftRange = formatNumRange(row.sqftMin, row.sqftMax, 'sqft');
  const readyLabel = formatReadyDate(row.readyDate);
  const expiresLabel = formatExpires(row.expiresAt);
  const garageLabel = parseGarage(row.description);
  const cleanedDesc = cleanDescription(row.description);

  // For master-planned developers, the underlying builder is in the title.
  const isMpDeveloper = MASTER_PLANNED_DEVELOPERS.has(row.builderName);
  const embeddedBuilder = isMpDeveloper ? extractEmbeddedBuilder(row.title) : null;
  const builderForPill = embeddedBuilder ?? row.builderName;
  const builderSlug = builderNameToSlug(builderForPill);

  // The "developer / community" line. La Cima · communityName when set
  // (otherwise just the master-planned developer name), or the row's
  // communityName for non-MP builders.
  const developerLine =
    isMpDeveloper
      ? row.communityName ?? row.builderName
      : row.communityName;

  // Stats grid items
  const stats: { label: string; value: string }[] = [];
  if (bedsRange) stats.push({ label: 'Bedrooms', value: bedsRange.replace(/ bd$/, '') });
  if (bathsRange) stats.push({ label: 'Bathrooms', value: bathsRange.replace(/ ba$/, '') });
  if (sqftRange) stats.push({ label: 'Sq ft', value: sqftRange.replace(/ sqft$/, '') });
  if (garageLabel) stats.push({ label: 'Garage', value: garageLabel.replace(/-car garage$/i, '-car') });
  if (readyLabel) stats.push({ label: 'Move-in', value: readyLabel });
  if (row.planName) stats.push({ label: 'Plan', value: row.planName });

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {/* Use minmax(0,1fr) for the gallery column so the column can shrink
          below its content's intrinsic width. Without this, the gallery's
          high-resolution image (1500px+ natural width) pushes the
          implicit `1fr` track past the container and the right-side
          sidebar overflows the viewport. */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
        {/* Left column: gallery + description */}
        <div>
          <InventoryGallery
            galleryUrls={row.galleryUrls}
            thumbnailUrl={row.thumbnailUrl}
            alt={`${row.builderName} — ${row.title}`}
          />

          {cleanedDesc && (
            <section className="mt-8">
              <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-3">
                About this {row.kind === 'promotion' ? 'promotion' : 'home'}
              </h2>
              <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                {cleanedDesc}
              </p>
            </section>
          )}
        </div>

        {/* Right column: summary */}
        <aside className="space-y-6">
          <div>
            {/* Builder pill */}
            <div className="mb-3 flex items-center gap-2">
              <Link
                href={`/builders/${builderSlug}`}
                className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium px-2 py-1 border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-md hover:bg-emerald-100 transition-colors"
              >
                {builderForPill}
              </Link>
              {row.kind === 'promotion' && (
                <span className="inline-block text-[10px] uppercase tracking-[0.1em] font-medium px-2 py-1 border border-amber-200 bg-amber-50 text-amber-800 rounded-md">
                  Promotion
                </span>
              )}
            </div>

            <PageTitle size="md">{row.title}</PageTitle>

            {developerLine && (
              <p className="mt-2 text-sm text-gray-600">
                {isMpDeveloper ? (
                  <Link
                    href={`/builders/${builderNameToSlug(row.builderName)}`}
                    className="hover:text-gray-900 hover:underline"
                  >
                    {developerLine}
                  </Link>
                ) : (
                  <span>{developerLine}</span>
                )}
              </p>
            )}

            {row.address ? (
              <p className="mt-1 text-sm text-gray-700">{row.address}</p>
            ) : (
              <p className="mt-1 text-sm text-gray-700">
                {row.city}, {row.state}
              </p>
            )}
          </div>

          {priceRange && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-3xl font-semibold text-gray-900">{priceRange}</p>
            </div>
          )}

          {stats.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">
                      {s.label}
                    </dt>
                    <dd className="mt-0.5 text-gray-900 font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {row.kind === 'promotion' && expiresLabel && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-xs uppercase tracking-[0.1em] text-gray-500">
                Available through
              </p>
              <p className="mt-0.5 text-gray-900 font-medium">{expiresLabel}</p>
            </div>
          )}

          {/* Action buttons live in the bottom floater pill (see below)
              so the right-side summary stays compact. The floater hosts:
              Back · Visit builder site · Promotions. */}
          {row.flyerPdfUrl && row.flyerPdfUrl.toLowerCase().endsWith('.pdf') && (
            <div className="border-t border-gray-200 pt-4">
              <a
                href={row.flyerPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
              >
                Download flyer
              </a>
            </div>
          )}
        </aside>
      </div>

      {/* Floater pill: Back · Visit builder site · Promotions. The
          builder URL prefers a non-PDF source URL (the actual listing
          page on the builder's site) over the flyerPdfUrl; PDFs stay
          available as the dedicated Download flyer button above. */}
      <InventoryDetailFloater
        rowId={row.id}
        builderName={row.builderName}
        externalUrl={pickBuilderSiteUrl(row)}
      />
    </main>
  );
}

// Choose which URL to send users to when they click "Visit builder site"
// in the floater. Prefer a non-PDF page so the link feels like a real
// destination; fall back to the PDF flyer if that's all we have.
function pickBuilderSiteUrl(row: BuilderInventoryRow): string | null {
  const isPdf = (u: string | null | undefined) =>
    !!u && u.toLowerCase().endsWith('.pdf');
  if (row.sourceUrl && !isPdf(row.sourceUrl)) return row.sourceUrl;
  if (row.flyerPdfUrl && !isPdf(row.flyerPdfUrl)) return row.flyerPdfUrl;
  return row.sourceUrl ?? row.flyerPdfUrl ?? null;
}
