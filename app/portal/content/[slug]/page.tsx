// Partner-managed content pages: logos, locations, staff.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { listRecords } from '@/lib/server/portal-records';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { PageIntro } from '@/components/portal/Mint';
import ContentClient from '../ContentClient';
import { KIND_SLUGS, KIND_CONFIG } from '@/lib/portal-resources';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function PortalContentKindPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const kind = KIND_SLUGS[slug];
  if (!kind) notFound();
  const user = await getCurrentPortalUser();
  if (!user) redirect('/portal/error?code=auth');
  await ensureSchema();
  const items = await listRecords(user.advertiser_id, kind);
  const cfg = KIND_CONFIG.find((c) => c.kind === kind)!;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/portal/content" className="text-sm text-[#42277C] hover:underline">&larr; My Content</Link>
        <PageIntro title={cfg.heading} />
      </div>
      <ContentClient initialItems={items} kinds={[kind]} />
    </div>
  );
}
