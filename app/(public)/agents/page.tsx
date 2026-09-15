import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';
import { ensurePublicationColumn } from '@/lib/publication-theme';
import { getCurrentUser } from '@/lib/server/auth/user';
import AgentCommandCenterClient, {
  type ReferralProvider,
} from './AgentCommandCenterClient';

export const metadata: Metadata = {
  title: 'Agent Command Center | Realty News Now',
  description:
    'A practical real estate workspace for Texas contract timing, field tools, and local partner connections.',
};

export const dynamic = 'force-dynamic';

type AdvertiserRow = ReferralProvider & {
  publication: 'austin' | 'san_antonio' | null;
};

export default async function AgentCommandCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents');

  let providers: ReferralProvider[] = [];

  // The command center remains useful even if the directory database is
  // temporarily unavailable. The only affected area is the live provider list;
  // no agent workflow or contract data is ever written from this public page.
  try {
    await ensureSchema();
    await ensureBuilderInventorySchema();
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, name, slug, website, publication, industry, tagline
      FROM advertisers
      WHERE COALESCE(status, 'advertiser') IN ('advertiser', 'active')
        AND NOT EXISTS (
          SELECT 1
          FROM builder_page_visibility v
          WHERE LOWER(TRIM(v.builder_name)) = LOWER(TRIM(advertisers.name))
            AND v.public_enabled = false
        )
      ORDER BY name ASC
    `) as unknown as AdvertiserRow[];

    providers = rows.map(({ publication: _publication, ...provider }) => provider);
  } catch (error) {
    console.error('[Agent Command Center] Partner directory unavailable', error);
  }

  return (
    <AgentCommandCenterClient
      providers={providers}
      workspaceKey={`rnn_agent_command_center_v1:${user.realtorId}`}
    />
  );
}
