import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PlatformAdminClient from './PlatformAdminClient';

export const dynamic = 'force-dynamic';

export default async function PlatformAdminPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <PlatformAdminClient />;
}
