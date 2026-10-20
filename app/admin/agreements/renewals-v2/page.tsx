// app/admin/agreements/renewals-v2/page.tsx
//
// Renewals (Beta): the one-tap renewal workspace. Runs alongside the live
// Agreements > Renewals flow; it does not replace it.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import AgreementsBeta from './AgreementsBeta';

export const dynamic = 'force-dynamic';

export default async function RenewalsV2Page() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <AgreementsBeta />;
}
