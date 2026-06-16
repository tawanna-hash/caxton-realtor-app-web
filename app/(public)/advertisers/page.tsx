// app/(public)/advertisers/page.tsx
//
// Public Advertisers directory. Server fetches all advertisers; the
// client component filters to match the active publication
// (caxton_pub in localStorage) so RealtyLine and Newsline San Antonio directories
// stay separate as the user switches publications.
//
// Names link to per-advertiser detail pages at /advertisers/<slug>.
// A small external-link icon opens the advertiser's company website
// in a new tab when set. The gated analytics report at
// /r/advertiser/<slug> is separate and unchanged.
//
// Linked from the BottomNav "Advertisers" tab and the NavDrawer Content
// section.

import { ensureSchema, getSql } from '@/lib/db';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import AdvertisersDirectoryClient from './AdvertisersDirectoryClient';

export const metadata = {
  title: 'Advertisers \u2014 Realty News Now',
  description:
    'Our advertising partners across RealtyLine Austin and Newsline San Antonio.',
};

export const dynamic = 'force-dynamic';

type AdvertiserRow = {
  id: number;
  name: string;
  slug: string;
  website: string | null;
  publication: 'austin' | 'san_antonio' | null;
};

export default async function AdvertisersDirectoryPage() {
  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  // Only active advertisers are public-facing. Paused, prospect, and
  // archived rows are hidden from the public directory. NULL status is
  // treated as 'active' for backward compatibility with legacy rows.
  const rows = (await sql`
    SELECT id, name, slug, website, publication
    FROM advertisers
    WHERE COALESCE(status, 'active') = 'active'
    ORDER BY name ASC
  `) as unknown as AdvertiserRow[];

  // Normalize publication: null \u2192 'austin' (RealtyLine), preserve known values.
  const advertisers = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    website: r.website,
    publication: (r.publication ?? 'austin') as 'austin' | 'san_antonio',
  }));

  // Houston/Dallas inherit RealtyLine's accent color (navy) since they're
  // under the RealtyLine umbrella and have no theme entries of their own.
  const realtylineAccent = getPublicationTheme('austin').primaryColor;
  const themes = {
    realtyline: { accent: realtylineAccent, label: 'RealtyLine Austin' },
    newsline: { accent: getPublicationTheme('san_antonio').primaryColor, label: 'Newsline San Antonio' },
    'realtyline-houston': { accent: realtylineAccent, label: 'RealtyLine Houston' },
    'realtyline-dallas': { accent: realtylineAccent, label: 'RealtyLine Dallas/FTW' },
  };

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Partners
          </p>
          <PageTitle size="md">Advertisers</PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl">
            The local businesses, builders, and brands who make our
            publication possible. Switch publications to see partners
            for RealtyLine Austin or Newsline San Antonio.
          </p>
        </header>

        <AdSlot slug="advertisers_directory_top" className="mb-8" />

        <AdvertisersDirectoryClient
          advertisers={advertisers}
          themes={themes}
        />

        <div className="mt-10 border-t border-gray-200 pt-8">
          <p className="text-sm text-gray-600 font-light leading-relaxed">
            Interested in advertising with us?{' '}
            <a
              href="/advertise"
              className="text-gray-900 underline underline-offset-2 hover:no-underline"
            >
              Learn more about partnership opportunities
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
