import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import QuickBooksClient from './QuickBooksClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · QuickBooks Online' };

export default async function QuickBooksPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <QuickBooksClient />;
}

