import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import AgentCenterAdminClient from './AgentCenterAdminClient';

export const dynamic = 'force-dynamic';

export default async function AgentCenterAdminPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  const versions = await listTrecFormVersions();
  return <AgentCenterAdminClient initialVersions={versions} />;
}
