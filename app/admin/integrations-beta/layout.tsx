import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import IntegrationsNav from './IntegrationsNav';

export const dynamic = 'force-dynamic';

export default async function Layout({ children }: { children: React.ReactNode }) {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div><h1 className="text-[22px] font-semibold text-[color:var(--ds-ink)]">Integrations</h1><p className="text-sm text-[color:var(--ds-body)]">Manage your integrations</p></div>
      <IntegrationsNav />
      {children}
    </div>
  );
}
