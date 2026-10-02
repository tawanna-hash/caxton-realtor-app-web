// Bulk email verification for the Mailing List HUB.
import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import BulkVerifyClient from './BulkVerifyClient';

export const dynamic = 'force-dynamic';

export default async function BulkVerifyPage() {
  let ok = false;
  try { ok = (await getCurrentAdmin()) !== null; } catch { ok = false; }
  if (!ok) redirect('/admin/login');
  return <BulkVerifyClient />;
}
