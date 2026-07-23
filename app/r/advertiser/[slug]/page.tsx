// app/r/advertiser/[slug]/page.tsx
//
// Public advertiser report — server component. Looks up the advertiser,
// decides between dashboard / email gate / 404, and passes publication
// to the client component so the UI themes correctly.

import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSql, ensureSchema } from '@/lib/db';
import { grantCookieName, isCookieGrantValid } from '@/lib/advertiser-grants';
import { ensurePublicationColumn, getPublicationTheme } from '@/lib/publication-theme';
import type { Advertiser } from '@/lib/advertisers';
import PublicReportClient from './PublicReportClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  return { title: `Performance Report — ${slug}` };
}

export default async function PublicAdvertiserPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { t } = await searchParams;

  await ensureSchema();
  await ensurePublicationColumn();
  const sql = getSql();

  // Only active advertisers expose a public-facing report. Paused,
  // prospect, and archived rows 404 even with a valid share token —
  // matches the public directory rule.
  const rows = (await sql`
    SELECT * FROM advertisers
    WHERE slug = ${slug}
      AND COALESCE(status, 'advertiser') IN ('advertiser', 'active')
  `) as unknown as Advertiser[];
  if (rows.length === 0) notFound();
  const advertiser = rows[0];

  const shareTokenMatches = !!t && t === advertiser.share_token;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(grantCookieName(advertiser.id))?.value;
  const cookieValid = await isCookieGrantValid(advertiser.id, cookieValue);

  // Content gate walls removed: anyone with the share token (or a valid
  // grant cookie) sees the dashboard directly — no email-capture wall.
  if (!shareTokenMatches && !cookieValid) notFound();

  const theme = getPublicationTheme(advertiser.publication);

  return (
    <PublicReportClient
      advertiser={{
        id: advertiser.id,
        name: advertiser.name,
        slug: advertiser.slug,
      }}
      theme={theme}
      shareToken={shareTokenMatches ? t : undefined}
    />
  );
}
