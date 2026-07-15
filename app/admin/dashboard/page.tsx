import type { Metadata } from 'next';
import PageTitle from '@/components/ui/PageTitle';
import DashboardClient from './DashboardClient';
import { fetchDashboardData } from './data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard — Admin',
};

export default async function AdminDashboardPage() {
  const data = await fetchDashboardData();
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageTitle size="md">Publisher Dashboard</PageTitle>
      <DashboardClient data={data} />
    </div>
  );
}
