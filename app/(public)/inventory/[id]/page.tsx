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
import { getBuilderInventoryById, listBuilderInventory, type BuilderInventoryRow } from '@/lib/builder-inventory';
import { builderNameToSlug } from '@/lib/builder-slug';
import { getServerPub } from '@/lib/publication';
import InventoryGallery from '@/components/inventory/InventoryGallery';
import InventoryDetailFloater from '@/components/inventory/InventoryDetailFloater';
import RequestInfoBox from '@/components/inventory/RequestInfoBox';
import { getCommunityContactLink } from '@/lib/community-contacts';
import FloorplanViewer from './FloorplanViewer';
import FlyerCarousel from './FlyerCarousel';
import OtherPromotionsCarousel, { type SiblingPromo } from './OtherPromotionsCarousel';

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

  // Sibling promotions for the same builder — when there's more than one,
  // we surface an "Other promotions" carousel of their flyers below.
  let otherPromotions: SiblingPromo[] = [];
  if (row.kind === 'promotion') {
    const pub = await getServerPub();
    const all = await listBuilderInventory({
      status: 'active',
      builderName: row.builderName,
      publication: pub,
      kind: 'promotion',
      limit: 50,
    });
    otherPromotions = all
      .filter(
        (r) =>
          r.id !== row.id &&
          !!r.flyerPdfUrl &&
          r.flyerPdfUrl.toLowerCase().endsWith('.pdf'),
      )
      .map((r) => ({ id: r.id, title: r.title, flyerPdfUrl: r.flyerPdfUrl as string }));
  }

  return <DetailView row={row} otherPromotions={otherPromotions} />;
}

function DetailView({
  row,
  otherPromotions,
}: {
  row: BuilderInventoryRow;
  otherPromotions: SiblingPromo[];
}) {
  const priceRange = formatPriceRange(row.priceMin, row.priceMax);
  const bedsRange = formatNumRange(row.bedsMin, row.bedsMax, 'bd');
  const bathsRange = formatNumRange(row.bathsMin, row.bathsMax, 'ba');
  const sqftRange = formatNumRange(row.sqftMin, row.sqftMax, 'sqft');
  const readyLabel = formatReadyDate(row.readyDate);
  const expiresLabel = formatExpires(row.expiresAt);
  const garageLabel = parseGarage(row.description);
  const cleanedDesc = cleanDescription(row.description);

  // Floorplan viewer + geo live as _-prefixed meta keys in extraDetails.
  const extra = row.extraDetails ?? {};
  const floorplanUrl = extra._floorplanUrl ?? null;
  // Image unless it's M/I's interactive ML3D viewer (ml3ds-icon.com), which
  // needs an <iframe>. Newmark's JPG and La Cima's pipsy CDN images both
  // render via FloorplanViewer.
  const isFloorplanImage =
    !!floorplanUrl && !/ml3ds-icon\.com|kb-vu\.com/i.test(floorplanUrl);
  const latitude = extra._latitude ?? null;
  const longitude = extra._longitude ?? null;
  const hasMap = !!(latitude && longitude);
  const virtualTourUrl = extra._virtualTourUrl ?? null;

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
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
        {/* Left column: gallery + description */}
        <div className="min-w-0">
          <InventoryGallery
            galleryUrls={row.galleryUrls}
            thumbnailUrl={row.thumbnailUrl}
            alt={`${row.builderName} — ${row.title}`}
          />

          {row.flyerPdfUrl && row.flyerPdfUrl.toLowerCase().endsWith('.pdf') && (
            <FlyerCarousel flyerPdfUrl={row.flyerPdfUrl} title={row.title} />
          )}

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
        <aside className="space-y-6 min-w-0">
          <div>
            {/* Builder pill */}
            <div className="mb-3 flex items-center gap-2">
              <Link
                href={`/builders/${builderSlug}`}
                className="inline-block text-xs uppercase tracking-[0.1em] font-semibold px-3 py-1.5 border border-[#5a0e5f] bg-[#5a0e5f] text-white rounded-md hover:bg-[#301D5D] hover:border-[#301D5D] transition-colors"
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

          <RequestInfoBox
            listingId={row.id}
            title={row.title}
            builderName={row.builderName}
            communityName={row.communityName}
            contactUrl={getCommunityContactLink(row.builderName, row.communityName)}
          />

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
              Back · Visit builder site · Promotions. The Download-flyer
              button lives under the featured image above (left column). */}
        </aside>
      </div>

      {otherPromotions.length > 0 && (
        <OtherPromotionsCarousel promotions={otherPromotions} />
      )}

      {row.extraDetails && Object.keys(row.extraDetails).some((k) => !k.startsWith('_')) && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium mb-4">
            Property details
          </h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-6 text-sm">
            {Object.entries(row.extraDetails).filter(([k]) => !k.startsWith('_')).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs uppercase tracking-[0.1em] text-gray-500">{label}</dt>
                <dd className="mt-0.5 text-gray-900 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {floorplanUrl && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
              Floorplan
            </h2>
            <a
              href={floorplanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#5a0e5f] hover:underline"
            >
              Open full screen
            </a>
          </div>
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            {isFloorplanImage ? (
              <FloorplanViewer src={floorplanUrl} alt="Floorplan" />
            ) : (
              <iframe
                src={floorplanUrl}
                title="Floorplan"
                loading="lazy"
                scrolling="no"
                className="w-full"
                style={{ height: 560 }}
              />
            )}
          </div>
        </section>
      )}

      {virtualTourUrl && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
              3D Tour
            </h2>
            <a
              href={virtualTourUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#5a0e5f] hover:underline"
            >
              Open in new tab
            </a>
          </div>
          <div className="rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
            <iframe
              src={virtualTourUrl}
              title="3D Tour"
              loading="lazy"
              className="w-full"
              style={{ height: 560 }}
              allow="fullscreen; xr-spatial-tracking"
            />
          </div>
        </section>
      )}

      {hasMap && (
        <section className="mt-10 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm uppercase tracking-[0.15em] text-gray-500 font-medium">
              Location
            </h2>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#5a0e5f] hover:underline"
            >
              Get directions
            </a>
          </div>
          <div className="rounded-lg overflow-hidden border border-gray-200">
            <iframe
              src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
              title="Map"
              loading="lazy"
              className="w-full"
              style={{ height: 360 }}
            />
          </div>
        </section>
      )}

      {/* Floater pill: Back · Visit builder site · Promotions. The
          builder URL prefers a non-PDF source URL (the actual listing
          page on the builder's site) over the flyerPdfUrl; PDFs stay
          available as the dedicated Download flyer button above. */}
      <InventoryDetailFloater
        rowId={row.id}
        builderName={row.builderName}
        externalUrl={pickBuilderSiteUrl(row)}
        flyerPdfUrl={row.flyerPdfUrl}
        shareTitle={`${row.builderName} — ${row.title}`}
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
