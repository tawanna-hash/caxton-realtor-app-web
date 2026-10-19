import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listContracts } from '@/lib/server/contract-dates';
import ContractsClient from './ContractsClient';
import ContractsNav from './ContractsNav';

export const metadata: Metadata = {
  title: 'Contract Dates | Realty News Now',
  description: 'Upload a Texas TREC contract, confirm the important dates, and get deadline alerts by email or push.',
};

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcontracts');
  const { contracts, alerts } = await listContracts(user.realtorId);
  return (
    <>
      <ContractsNav active="dates" />
      <ContractsClient realtorId={user.realtorId} initialContracts={contracts} initialAlerts={alerts} />
    </>
  );
}
