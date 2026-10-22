import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import TemplatesPanel from '../renewals-v2/TemplatesPanel';
import { A } from '@/components/anchor/ui';

export const dynamic = 'force-dynamic';

export default async function TemplatesBetaPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6" data-anchor-ui="true" data-no-auto-open>
      <div className="flex items-center gap-3"><h1 className={A.title}>Templates</h1></div>
      <TemplatesPanel />
    </div>
  );
}
