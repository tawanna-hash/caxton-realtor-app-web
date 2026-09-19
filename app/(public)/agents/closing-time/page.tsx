import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { getActiveTrecFormVersion, listTrecFormVersions } from '@/lib/server/trec-form-versions';
import ClosingTime from '../ClosingTime';
import TrecFormsLibrary from '../TrecFormsLibrary';
import ComingSoon from '../ComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Closing Time | Realty News Now',
  description: 'Securely prepare transaction dates, tasks, documents, and TREC contract details.',
};

export default async function ClosingTimePage() {
  if (await isClosingTimeGated()) {
    return <ComingSoon />;
  }

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents%2Fclosing-time');

  const [workspaceRecord, trecFormVersion, trecFormVersions] = await Promise.all([
    getAgentCommandCenterWorkspace(user.realtorId),
    getActiveTrecFormVersion(),
    listTrecFormVersions(),
  ]);

  return (
    <>
      <ClosingTime
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
