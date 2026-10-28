import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import TermsEditor from './TermsEditor';

export const dynamic = 'force-dynamic';

export default async function AgreementTermsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/get-paid/login');
  return <TermsEditor />;
}
