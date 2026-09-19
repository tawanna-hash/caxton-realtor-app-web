import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { ensureBuilderInventorySchema } from '@/lib/builder-inventory';
import {
  ensurePublicationColumn,
  parsePublications,
  type PublicationKey,
} from '@/lib/publication-theme';
import { getCurrentUser } from '@/lib/server/auth/user';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { getActiveTrecFormVersion, listTrecFormVersions } from '@/lib/server/trec-form-versions';
import { getRealtorMe } from '@/lib/server/realtors-store';
import AgentCommandCenterClient, {
  type ReferralProvider,
} from './AgentCommandCenterClient';
import ComingSoon from './ComingSoon';

export const metadata: Metadata = {
  title: 'Closing Time | Realty News Now',
  description:
    'A practical real estate workspace for Texas contract timing, field tools, and local partner connections.',
};

export const dynamic = 'force-dynamic';

type AdvertiserRow = ReferralProvider & {
  publication: string | null;
};

export default async function AgentCommandCenterPage() {
  if (await isClosingTimeGated()) {
    return <ComingSoon />;
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents');

  let providers: ReferralProvider[] = [];
  const [workspaceRecord, realtor, trecFormVersion, trecFormVersions] = await Promise.all([
    getAgentCommandCenterWorkspace(user.realtorId),
    getRealtorMe(user.realtorId),
    getActiveTrecFormVersion(),
    listTrecFormVersions(),
  ]);

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
        AND NULLIF(TRIM(COALESCE(industry, '')), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM builder_page_visibility v
          WHERE LOWER(TRIM(v.builder_name)) = LOWER(TRIM(advertisers.name))
            AND v.public_enabled = false
        )
      ORDER BY name ASC
    `) as unknown as AdvertiserRow[];

    const agentMarket = realtor?.market;
    providers = rows
      .filter((row) => {
        if (agentMarket === 'both') return true;
        return parsePublications(row.publication).includes(agentMarket as PublicationKey);
      })
      .map(({ publication: _publication, ...provider }) => provider);
  } catch (error) {
    console.error('[Closing Time] Partner directory unavailable', error);
  }

  return (
    <AgentCommandCenterClient
      providers={providers}
      workspaceKey={`rnn_agent_command_center_v1:${user.realtorId}`}
      realtorId={user.realtorId}
      initialWorkspace={workspaceRecord?.workspace ?? null}
      initialWorkspaceVersion={workspaceRecord?.version ?? null}
      trecFormVersion={trecFormVersion}
      trecFormVersions={trecFormVersions}
    />
  );
}
