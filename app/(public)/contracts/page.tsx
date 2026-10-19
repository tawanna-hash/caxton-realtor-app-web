import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listContracts } from '@/lib/server/contract-dates';
import ContractsClient from './ContractsClient';
import ContractsShell from './ContractsShell';

export const metadata: Metadata = {
  title: 'Closing Time (limited edition) | Realty News Now',
  description: 'Upload a Texas TREC contract, confirm the important dates, and get deadline alerts by email or push.',
};

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=%2Fcontracts');
  const { contracts, alerts } = await listContracts(user.realtorId);
  return (
    <ContractsShell
      active="dates"
      hero
      title="Keep Your Deals Moving"
      subtitle="Stay Ahead Of Deadlines."
      description="Upload a Texas TREC contract. We read the dates, you confirm them, and we alert you by email or push before each one is due. This is a reminder tool, not legal advice. Always check dates against the contract."
    >
      <ContractsClient realtorId={user.realtorId} initialContracts={contracts} initialAlerts={alerts} />
    </ContractsShell>
  );
}
