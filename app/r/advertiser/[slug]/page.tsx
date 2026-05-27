// app/r/advertiser/[slug]/page.tsx
//
// Public advertiser report. URL: /r/advertiser/<slug>?t=<share_token>
//
// Access rules:
//   - UNGATED advertiser: valid share_token in ?t= OR valid cookie → dashboard
//   - GATED advertiser:
//       valid cookie → dashboard
//       valid share_token (no cookie) → email gate form
//       neither → 404
//
// We use notFound() for all access denials to avoid leaking which
// slugs exist or whether the token is valid.

import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getSql, ensureSchema } from '@/lib/db';
import { grantCookieName, isCookieGrantValid } from '@/lib/advertiser-grants';
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
  const sql = getSql();

  const rows = (await sql`
    SELECT id, name, slug, share_token, contact_email, requires_email_gate
    FROM advertisers WHERE slug = ${slug}
  `) as unknown as Advertiser[];
  if (rows.length === 0) notFound();
  const advertiser = rows[0];

  const shareTokenMatches = !!t && t === advertiser.share_token;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(grantCookieName(advertiser.id))?.value;
  const cookieValid = await isCookieGrantValid(advertiser.id, cookieValue);

  let mode: 'dashboard' | 'email_gate';
  const isGated = advertiser.requires_email_gate;

  if (isGated && cookieValid) {
    mode = 'dashboard';
  } else if (isGated && shareTokenMatches) {
    mode = 'email_gate';
  } else if (!isGated && (shareTokenMatches || cookieValid)) {
    mode = 'dashboard';
  } else {
    notFound();
  }

  return (
    <PublicReportClient
      advertiser={{
        id: advertiser.id,
        name: advertiser.name,
        slug: advertiser.slug,
        requires_email_gate: advertiser.requires_email_gate,
      }}
      mode={mode}
      shareToken={shareTokenMatches ? t : undefined}
    />
  );
}
