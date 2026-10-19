import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import TrecFormsLibrary from '../../agents/TrecFormsLibrary';
import ContractsNav from '../ContractsNav';

export const metadata: Metadata = {
  title: 'TREC Library | Realty News Now',
  description: 'Texas Real Estate Commission forms, ready to open, fill and download.',
};

export const dynamic = 'force-dynamic';

export default async function ContractsFormsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcontracts%2Fforms');
  const versions = await listTrecFormVersions();
  return (
    <>
      <ContractsNav active="forms" />
      <main id="agent-desk" className="mx-auto w-full max-w-3xl px-4 py-6 text-[#1B1726]">
        <h1 className="text-3xl font-bold text-[#301D5D]">TREC Library</h1>
        <div className="mt-4"><TrecFormsLibrary versions={versions} embedded /></div>
      </main>
    </>
  );
}
