import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import TrecFormsLibrary from '../../agents/TrecFormsLibrary';
import ContractsShell from '../ContractsShell';

export const metadata: Metadata = {
  title: 'TREC Library | Closing Time (limited edition)',
  description: 'Texas Real Estate Commission forms, ready to open, fill and download.',
};

export const dynamic = 'force-dynamic';

export default async function ContractsFormsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcontracts%2Fforms');
  const versions = await listTrecFormVersions();
  return (
    <ContractsShell active="forms" title="TREC Library" description="Texas Real Estate Commission forms, ready to open, fill and download.">
      <TrecFormsLibrary versions={versions} embedded />
    </ContractsShell>
  );
}
