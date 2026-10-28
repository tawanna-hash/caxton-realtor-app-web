import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PayoutsPanel from './PayoutsPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Stripe payouts' };

export default async function Page() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <PayoutsPanel />
    </div>
  );
}
