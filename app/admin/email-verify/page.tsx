// app/admin/email-verify/page.tsx
//
// Ad-hoc email verifier admin tool. Single + Bulk tabs backed by
// /api/admin/email-verify and /api/admin/email-verify/bulk, both of which
// delegate to the production-grade lib/email-verify.ts pipeline already
// used by the mailing-list flows.
//
// This page does NOT persist results to mailing_contacts — it's a
// standalone check-an-address tool. Use the mailing-list verify buttons
// when you want the verdict written back to a row.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import EmailVerifyClient from './EmailVerifyClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function AdminEmailVerifyPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  return <EmailVerifyClient />;
}
