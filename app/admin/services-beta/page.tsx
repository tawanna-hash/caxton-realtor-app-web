import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ServicesBeta from './ServicesBeta';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <ServicesBeta />
    </div>
  );
}
