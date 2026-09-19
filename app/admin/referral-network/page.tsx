import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ReferralNetworkApplicationsClient from './ReferralNetworkApplicationsClient';

export const dynamic = 'force-dynamic';

export default async function ReferralNetworkAdminPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <ReferralNetworkApplicationsClient />;
}
