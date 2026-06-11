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
import type { Advertiser } from '@/lib/advertisers';
import { listBuilderInventory, type BuilderInventoryRow } from '@/lib/builder-inventory';
import AdvertiserDetailClient from './AdvertiserDetailClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT name, tagline FROM advertisers WHERE slug = ${slug} LIMIT 1
  `) as unknown as Array<{ name: string; tagline: string | null }>;
  if (rows.length === 0) return { title: 'Advertiser not found' };
  const r = rows[0];
  return {
    title: `${r.name} — Realty News Now`,
    description: r.tagline ?? `${r.name} on Realty News Now.`,
  };
}

export default async function AdvertiserDetailPage({ params }: PageProps) {
  const { slug } = await params;

  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  const rows = (await sql`
    SELECT * FROM advertisers WHERE slug = ${slug} LIMIT 1
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

  const theme = getPublicationTheme(advertiser.publication);

  return (
    <AdvertiserDetailClient
      advertiser={advertiser}
      inventory={inventoryRows}
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

