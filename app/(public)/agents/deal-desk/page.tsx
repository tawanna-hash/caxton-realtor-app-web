import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import AgentDealDesk from '../AgentDealDesk';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your Deal Desktop | Realty News Now',
  description: 'Securely prepare transaction dates, tasks, documents, and TREC contract details.',
};

export default async function AgentDealDeskPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents%2Fdeal-desk');

  const workspaceRecord = await getAgentCommandCenterWorkspace(user.realtorId);

  return (
    <AgentDealDesk
      workspaceKey={`rnn_agent_command_center_v1:${user.realtorId}`}
      realtorId={user.realtorId}
      initialWorkspace={workspaceRecord?.workspace ?? null}
      initialWorkspaceVersion={workspaceRecord?.version ?? null}
    />
  );
}
