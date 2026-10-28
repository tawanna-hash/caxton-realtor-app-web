import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import SettingsForm from './SettingsForm';

export const dynamic = 'force-dynamic';

export default async function PaymentSettingsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <SettingsForm />;
}
