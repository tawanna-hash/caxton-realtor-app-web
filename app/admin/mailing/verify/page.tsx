// app/admin/mailing/verify/page.tsx
// Email Verifier inside the Mailing List HUB.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import VerifyHubClient from './VerifyHubClient';

export const dynamic = 'force-dynamic';

export default async function MailingVerifyPage() {
  let ok = false;
  try { ok = (await getCurrentAdmin()) !== null; } catch { ok = false; }
  if (!ok) redirect('/admin/login');
  return <VerifyHubClient />;
}
