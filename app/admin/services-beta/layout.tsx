import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ServicesNav from './ServicesNav';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <ServicesNav />
      {children}
    </div>
  );
}
