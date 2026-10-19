import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listTrecFormVersions } from '@/lib/server/trec-form-versions';
import ContractsShell from '../../ContractsShell';
import FillClient from './FillClient';

export const metadata: Metadata = {
  title: 'Fill A TREC Form | Closing Time (limited edition)',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export default async function FillPage({ searchParams }: { searchParams: Promise<{ form?: string }> }) {
  const { form } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/contracts/forms/fill?form=${form ?? ''}`)}`);
  const version = (await listTrecFormVersions()).find((v) => v.formFamily === form && v.isActive);
  if (!version) redirect('/contracts/forms');
  return (
    <ContractsShell active="forms">
      <FillClient version={version} />
    </ContractsShell>
  );
}
