import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { getActiveTrecFormVersion, listTrecFormVersions } from '@/lib/server/trec-form-versions';
import AgentDealDesk from '../AgentDealDesk';
import TrecFormsLibrary from '../TrecFormsLibrary';
import ComingSoon from './ComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Deal Desktop | Realty News Now',
  description: 'Securely prepare transaction dates, tasks, documents, and TREC contract details.',
};

// Agent Deal Desk is still in development. In production, only a signed-in
// admin can reach the real page — everyone else sees a Coming Soon message.
// Local dev and Vercel preview deployments are unaffected.
async function isDealDeskGated(): Promise<boolean> {
  if (process.env.VERCEL_ENV !== 'production') return false;
  const admin = await getCurrentAdmin();
  return !admin;
}

export default async function AgentDealDeskPage() {
  if (await isDealDeskGated()) {
    return <ComingSoon />;
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents%2Fdeal-desk');

  const [workspaceRecord, trecFormVersion, trecFormVersions] = await Promise.all([
    getAgentCommandCenterWorkspace(user.realtorId),
    getActiveTrecFormVersion(),
    listTrecFormVersions(),
  ]);

  return (
    <>
      <AgentDealDesk
        workspaceKey={`rnn_agent_command_center_v1:${user.realtorId}`}
        realtorId={user.realtorId}
        initialWorkspace={workspaceRecord?.workspace ?? null}
        initialWorkspaceVersion={workspaceRecord?.version ?? null}
        trecFormVersion={trecFormVersion}
        trecFormVersions={trecFormVersions}
      />
      <TrecFormsLibrary versions={trecFormVersions} />
    </>
  );
}
