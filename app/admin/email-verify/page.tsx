// app/admin/email-verify/page.tsx
// Replaced the ad-hoc verifier with the bulk email verifier.
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import BulkVerifyClient from '@/app/admin/mailing/bulk-verify/BulkVerifyClient';

export const dynamic = 'force-dynamic';

export default async function AdminEmailVerifyPage() {
  let ok = false;
  try { ok = (await getCurrentAdmin()) !== null; } catch { ok = false; }
  if (!ok) redirect('/admin/login');
  return <BulkVerifyClient />;
}
