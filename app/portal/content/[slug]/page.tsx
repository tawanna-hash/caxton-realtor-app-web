// Partner-managed content pages: logos, locations, staff.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import PageTitle from '@/components/ui/PageTitle';
import ContentClient from '../ContentClient';
import { KIND_SLUGS, KIND_CONFIG, type PortalResource } from '@/lib/portal-resources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalContentKindPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kind = KIND_SLUGS[slug];
  if (!kind) notFound();
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id, kind, title, url, notes, fields, files, updated_at
      FROM portal_resources WHERE advertiser_id = ${user.advertiser_id} AND kind = ${kind}
     ORDER BY created_at DESC
  `) as unknown as (Omit<PortalResource, 'updated_at'> & { updated_at: string | Date })[];
  const items: PortalResource[] = rows.map((r) => ({
    ...r,
    updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
  const cfg = KIND_CONFIG.find((c) => c.kind === kind)!;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageTitle size="md">{cfg.heading}</PageTitle>
      </header>
      <ContentClient initialItems={items} kinds={[kind]} />
    </div>
  );
}
