import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/server/auth/user';
import { listContracts } from '@/lib/server/contract-dates';
import ContractsShell from '../ContractsShell';
import CalculatorsClient from './CalculatorsClient';

export const metadata: Metadata = {
  title: 'Calculators | Closing Time (limited edition)',
  description: 'Closing costs, net sheet, commission, mortgage, affordability, rent vs buy, investment, 1031 exchange, seller concessions and Texas title rates.',
};

export const dynamic = 'force-dynamic';

export default async function CalculatorsPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const user = await getCurrentUser();
  const { contracts } = user ? await listContracts(user.realtorId) : { contracts: [] };
  const options = contracts.map((c) => ({ id: c.id, address: c.propertyAddress, closingDate: c.closingDate, price: c.salesPrice, earnest: c.earnestMoney }));
  return (
    <ContractsShell active="calculators">
      <CalculatorsClient contracts={options} initialId={c} />
    </ContractsShell>
  );
}
