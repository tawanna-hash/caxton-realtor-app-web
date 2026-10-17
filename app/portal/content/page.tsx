// app/portal/content/page.tsx — partner-managed content (issue links, event
// image folders, featured articles, logo files, locations, staff).

import { redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import PageTitle from '@/components/ui/PageTitle';
import ContentClient from './ContentClient';
import type { PortalResource } from '@/lib/portal-resources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalContentPage() {
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, kind, title, url, notes, fields, files, updated_at
      FROM portal_resources WHERE advertiser_id = ${user.advertiser_id}
     ORDER BY created_at DESC
  `) as unknown as (Omit<PortalResource, 'updated_at'> & { updated_at: string | Date })[];
  const items: PortalResource[] = rows.map((r) => ({
    ...r,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));

  return (
    <div className="space-y-8">
      <header>
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">Portal</div>
        <PageTitle size="md">My Content</PageTitle>
        <p className="text-gray-600 mt-1">Add, edit, or remove anything below. Changes save right away.</p>
      </header>
      <ContentClient initialItems={items} />
    </div>
  );
}
