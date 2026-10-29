import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import W9Form from '@/components/get-paid/W9Form';

export const dynamic = 'force-dynamic';

export default async function W9Page() {
  if (!(await getCurrentAdmin())) redirect('/admin/get-paid/login');
  return <W9Form />;
}
