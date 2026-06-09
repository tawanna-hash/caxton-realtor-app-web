// app/admin/mailing/sabor-members/page.tsx
//
// SABOR Members admin landing page. Shows sync status, the freshness of
// the captured ramco.sabor.com cookies, and a "Sync SABOR Now" button
// that triggers the GitHub Actions workflow.

import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import SaborMembersClient from './SaborMembersClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function SaborMembersPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  return <SaborMembersClient />;
}
