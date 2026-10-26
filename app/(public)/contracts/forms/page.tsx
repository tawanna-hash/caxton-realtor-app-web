import type { Metadata } from 'next';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import FormsView from './FormsView';
import ContractsShell from '../ContractsShell';

export const metadata: Metadata = {
  title: 'TREC Library | Closing Time (limited edition)',
  description: 'Texas Real Estate Commission forms, ready to open, fill and download.',
};

export const dynamic = 'force-dynamic';

export default async function ContractsFormsPage() {
  const versions = await listTrecFormVersions();
  return (
    <ContractsShell active="forms">
      <FormsView versions={versions} />
    </ContractsShell>
  );
}
