// app/(public)/advertisers/[slug]/page.tsx
//
// Public per-advertiser detail page. Renders the advertiser's public
// profile (logo, name, tagline, bio, website, contact info, social links,
// address with directions) plus any active builder_inventory submissions
// matched by builder name (case-insensitive).
//
// Linked from the public /advertisers directory. Separate from the gated
// /r/advertiser/<slug> analytics report.

import { notFound } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import type { Advertiser, AdvertiserLocation, AdvertiserStaff } from '@/lib/advertisers';
import { listBuilderInventory, type BuilderInventoryRow } from '@/lib/builder-inventory';
import AdvertiserDetailClient from './AdvertiserDetailClient';

// Advertiser detail pages change infrequently (edits happen via /admin, not
// per-request). Switching from force-dynamic to ISR with a 10-minute revalidate
// window cuts cold-cache mobile LCP dramatically (was 4.2s on hollywood-crawford
// in PSI) by serving cached HTML from Vercel's edge instead of running 4-6
// serial Neon queries on every visit. The page still revalidates in the
// background so edits surface within ~10 min without a manual purge.
export const revalidate = 600;

// Pre-render the active advertiser slugs at build time. This makes the very
// first visit after a deploy fast too — no on-demand render. New advertisers
// fall through to on-demand rendering and get cached on first hit.
export async function generateStaticParams() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT slug FROM advertisers
      WHERE COALESCE(status, 'advertiser') IN ('advertiser', 'active')
    `) as unknown as Array<{ slug: string }>;
    return rows.map((r) => ({ slug: r.slug }));
  } catch {
    // If the DB is unreachable at build time (rare — build runs against
    // production Neon), fall back to fully on-demand rendering. The page
    // still works, it just won't be pre-rendered.
    return [];
  }
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT name, tagline FROM advertisers
    WHERE slug = ${slug}
      AND COALESCE(status, 'advertiser') IN ('advertiser', 'active')
    LIMIT 1
  `) as unknown as Array<{ name: string; tagline: string | null }>;
  if (rows.length === 0) return { title: 'Advertiser not found' };
  const r = rows[0];
  // Per-page canonical — without this the root layout's `alternates.canonical:
  // '/'` propagates and every advertiser page tells Google its canonical URL
  // is the homepage. That made all advertiser pages compete with `/` in the
  // index instead of standing on their own (PSI SEO flag on every page).
  const canonical = `/advertisers/${slug}`;
  return {
    title: `${r.name} — Realty News Now`,
    description: r.tagline ?? `${r.name} on Realty News Now.`,
    alternates: { canonical },
    openGraph: {
      url: canonical,
      title: `${r.name} — Realty News Now`,
      description: r.tagline ?? `${r.name} on Realty News Now.`,
    },
  };
}

export default async function AdvertiserDetailPage({ params }: PageProps) {
  const { slug } = await params;

  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  // Only active advertisers have a public detail page. Paused,
  // prospect, and archived rows 404 to match the public directory.
  const rows = (await sql`
    SELECT * FROM advertisers
    WHERE slug = ${slug}
      AND COALESCE(status, 'advertiser') IN ('advertiser', 'active')
    LIMIT 1
  `) as unknown as Advertiser[];
  if (rows.length === 0) notFound();
  const advertiser = rows[0];

  // Pull active listings + promotions whose builder_name matches the
  // advertiser's name (case-insensitive). Also check `company` if set,
  // since some advertiser records use that for the trading name.
  const candidateNames = [advertiser.name];
  if (advertiser.company && advertiser.company !== advertiser.name) {
    candidateNames.push(advertiser.company);
  }

  let inventoryRows: BuilderInventoryRow[] = [];
  for (const name of candidateNames) {
    try {
      const r = await listBuilderInventory({
        status: 'active',
        builderName: name,
        limit: 500,
      });
      inventoryRows = inventoryRows.concat(r);
    } catch {
      // Non-fatal — the page still renders without inventory.
    }
  }
  // De-dupe by id (in case name and company match the same builder rows).
  const seen = new Set<number>();
  inventoryRows = inventoryRows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Locations + staff (Session 19) — best-effort, non-fatal if tables
  // don't exist yet (ensureSchema will create them on first request).
  let locations: AdvertiserLocation[] = [];
  let staff: AdvertiserStaff[] = [];
  try {
    const locRows = (await sql`
      SELECT * FROM advertiser_locations
      WHERE advertiser_id = ${advertiser.id}
      ORDER BY is_primary DESC, sort_order ASC, created_at ASC
    `) as unknown as AdvertiserLocation[];
    locations = locRows;

    const staffRows = (await sql`
      SELECT * FROM advertiser_staff
      WHERE advertiser_id = ${advertiser.id}
      ORDER BY sort_order ASC, created_at ASC
    `) as unknown as Array<Omit<AdvertiserStaff, 'location_ids'>>;
    const staffIds = staffRows.map((s) => s.id);
    let joinRows: Array<{ staff_id: string; location_id: string }> = [];
    if (staffIds.length > 0) {
      joinRows = (await sql`
        SELECT staff_id, location_id
        FROM advertiser_staff_locations
        WHERE staff_id = ANY(${staffIds}::uuid[])
      `) as unknown as Array<{ staff_id: string; location_id: string }>;
    }
    const staffLocMap = new Map<string, string[]>();
    for (const j of joinRows) {
      const arr = staffLocMap.get(j.staff_id) ?? [];
      arr.push(j.location_id);
      staffLocMap.set(j.staff_id, arr);
    }
    staff = staffRows.map((s) => ({
      ...s,
      location_ids: staffLocMap.get(s.id) ?? [],
    }));
  } catch (err) {
    console.warn('[advertiser detail] locations/staff load failed:', err);
  }

  const theme = getPublicationTheme(advertiser.publication);

  return (
    <AdvertiserDetailClient
      advertiser={advertiser}
      inventory={inventoryRows}
      locations={locations}
      staff={staff}
      theme={{
        accent: theme.primaryColor,
        label:
          advertiser.publication === 'san_antonio'
            ? 'Newsline San Antonio'
            : 'RealtyLine Austin',
      }}
      backHref="/advertisers"
    />
  );
}

