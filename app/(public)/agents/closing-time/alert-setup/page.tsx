import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { isClosingTimeGated } from '@/lib/server/closing-time-gate';
import { getAgentCommandCenterWorkspace } from '@/lib/server/agent-command-center-workspaces';
import { getActiveTrecFormVersion, listTrecFormVersions } from '@/lib/server/trec-form-versions';
import { listCustomFormVersions } from '@/lib/server/custom-forms';
import { getRealtorMe } from '@/lib/server/realtors-store';
import { loadReferralProviders } from '@/lib/server/referral-providers';
import ClosingTime from '../../ClosingTime';
import ComingSoon from '../../ComingSoon';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Closing Time Alert Setup | Realty News Now',
  description: 'Set up your iPhone, computer, and email so you never miss a Closing Time deadline alert.',
};

export default async function ClosingTimeAlertSetupPage() {
  if (await isClosingTimeGated()) return <ComingSoon />;

  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fagents%2Fclosing-time%2Falert-setup');

  const [workspaceRecord, realtor, trecFormVersion, trecFormVersions] = await Promise.all([
    getAgentCommandCenterWorkspace(user.realtorId),
    getRealtorMe(user.realtorId),
    getActiveTrecFormVersion(),
    Promise.all([listTrecFormVersions(), listCustomFormVersions(user.realtorId).catch(() => [])]).then(([builtIn, custom]) => [...builtIn, ...custom]),
  ]);

  const providers = await loadReferralProviders(realtor?.market);

  return (
    <ClosingTime
      initialView="alert-setup"
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
