// app/admin/mailing/publication/[list]/page.tsx
//
// Browse view for the unified publication email list — same data as the
// CSV download (segments + board mirror + app subscribers + newsletter,
// deduped by email) but rendered as a searchable, sortable table with
// per-row verification badge. A "Download CSV" button on the page
// still hits the existing /api/admin/mailing/publication-list?format=csv
// endpoint when the user wants the file.

import { notFound, redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { countPublicationList } from '@/lib/server/mailing/publication-counts';
import PublicationListClient from './PublicationListClient';
import { isPubId, type PubId } from '@/lib/publications';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

type Params = { list: string };

export default async function PublicationListViewPage({
  params,
}: {
  params: Promise<Params>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();

  const { list } = await params;
  if (!isPubId(list)) notFound();
  const pub = list as PubId;

  // Counts are cheap (one CTE) — render them server-side so the header
  // shows the right number even before the row payload arrives.
  const counts = await countPublicationList(pub);

  return <PublicationListClient pub={pub} initialCounts={counts} />;
}
