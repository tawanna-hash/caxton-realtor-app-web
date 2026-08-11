import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import FastEmailRealtorsClient from './FastEmailRealtorsClient';

export const dynamic = 'force-dynamic';

export default async function FastEmailRealtorsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return <FastEmailRealtorsClient />;
}
