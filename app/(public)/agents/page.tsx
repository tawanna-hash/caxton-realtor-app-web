import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { getActiveTrecFormVersion, listTrecFormVersions } from '@/lib/server/trec-form-versions';
import AgentCommandCenterClient from './AgentCommandCenterClient';
import ComingSoon from './ComingSoon';

export const metadata: Metadata = {
  title: "It's Almost Closing Time! | Realty News Now",
  description:
    'A practical real estate workspace for Texas contract timing, field tools, and local partner connections.',
};

export const dynamic = 'force-dynamic';

export default async function AgentCommandCenterPage() {
  if (await isClosingTimeGated()) {
    return <ComingSoon />;
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents');

  const [workspaceRecord, trecFormVersion, trecFormVersions] = await Promise.all([
    getAgentCommandCenterWorkspace(user.realtorId),
    getActiveTrecFormVersion(),
    listTrecFormVersions(),
  ]);

  return (
    <AgentCommandCenterClient
      workspaceKey={`rnn_agent_command_center_v1:${user.realtorId}`}
      realtorId={user.realtorId}
      initialWorkspace={workspaceRecord?.workspace ?? null}
      initialWorkspaceVersion={workspaceRecord?.version ?? null}
      trecFormVersion={trecFormVersion}
      trecFormVersions={trecFormVersions}
    />
  );
}
