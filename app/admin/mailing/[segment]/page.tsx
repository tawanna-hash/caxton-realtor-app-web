// app/admin/mailing/[segment]/page.tsx
//
// One segment of the mailing list. The :segment slug must be one of
// advertisers / non-advertisers / realtors (see SEGMENTS in lib/mailing).
//
// Server-side: auth check + initial render shell. Data fetching is
// handled by the client component so search/sort/refresh don't require
// a full page reload.

import { redirect, notFound } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { SEGMENTS, segmentFromSlug } from '@/lib/mailing';
import MailingClient from './MailingClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type Props = { params: Promise<{ segment: string }> };

export default async function MailingSegmentPage({ params }: Props) {
  const { segment: slug } = await params;
  const segment = segmentFromSlug(slug);
  if (!segment) notFound();

  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();

  const meta = SEGMENTS.find((s) => s.segment === segment)!;

  return <MailingClient segment={segment} slug={slug} label={meta.label} accent={meta.accent} />;
}
