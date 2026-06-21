// app/admin/mailing/suppressions/page.tsx
//
// Server-rendered shell for the suppression list. Auth + schema bootstrap
// only — the table itself is paged client-side from
// /api/admin/email-suppressions.

import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import SuppressionsClient from './SuppressionsClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function SuppressionsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  return <SuppressionsClient />;
}
