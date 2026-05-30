// app/(public)/advertisers/page.tsx
//
// Public Advertisers directory. Lists all advertisers grouped by
// publication (RealtyLine Austin, Newsline San Antonio). Display-only —
// per-advertiser detail pages live at /r/advertiser/<slug> but are gated,
// so this directory does not link out to them.
//
// Linked from the BottomNav "Advertisers" tab and the NavDrawer About
// section.

import { ensureSchema, getSql } from '@/lib/db';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import type { Advertiser } from '@/lib/advertisers';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';

export const metadata = {
  title: 'Advertisers \u2014 Realty News Now',
  description:
    'Our advertising partners across RealtyLine Austin and Newsline San Antonio.',
};

export const dynamic = 'force-dynamic';

export default async function AdvertisersDirectoryPage() {
  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  const advertisers = (await sql`
    SELECT id, name, slug, publication
    FROM advertisers
    ORDER BY name ASC
  `) as unknown as Pick<Advertiser, 'id' | 'name' | 'slug' | 'publication'>[];

  const realtyline = advertisers.filter(
    (a) => (a.publication ?? 'austin') === 'austin',
  );
  const newsline = advertisers.filter(
    (a) => (a.publication ?? 'austin') === 'san_antonio',
  );

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
            publications possible. Thanks to our advertising partners
            across RealtyLine Austin and Newsline San Antonio.
          </p>
        </header>

        <AdSlot slug="advertisers_directory_top" className="mb-8" />

        {realtyline.length > 0 ? (
          <Section
            eyebrow="RealtyLine Austin"
            advertisers={realtyline}
            accent={getPublicationTheme('austin').primaryColor}
          />
        ) : null}

        {newsline.length > 0 ? (
          <Section
            eyebrow="Newsline San Antonio"
            advertisers={newsline}
            accent={getPublicationTheme('san_antonio').primaryColor}
          />
        ) : null}

        {realtyline.length === 0 && newsline.length === 0 ? (
          <p className="text-center text-gray-500 font-light py-20">
            No advertisers to display right now.
          </p>
        ) : null}

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

function Section({
  eyebrow,
  advertisers,
  accent,
}: {
  eyebrow: string;
  advertisers: Array<{ id: number; name: string; slug: string }>;
  accent: string;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">
          {eyebrow}
        </p>
        <span
          className="text-xs uppercase tracking-wider font-medium"
          style={{ color: accent }}
        >
          {advertisers.length}{' '}
          {advertisers.length === 1 ? 'advertiser' : 'advertisers'}
        </span>
      </div>
      <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
        {advertisers.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-4 px-1 py-4"
          >
            <span
              className="flex-shrink-0 w-2 h-2 rounded-full"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <span className="flex-1 min-w-0 text-base text-gray-900 font-medium leading-tight">
              {a.name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
