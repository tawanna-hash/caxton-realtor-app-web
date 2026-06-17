// app/admin/activity/page.tsx
//
// Server-side auth gate for the activity dashboard. Renders the client
// component which polls /api/admin/activity for live updates.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ActivityClient from './ActivityClient';

export const dynamic = 'force-dynamic';

export default async function AdminActivityPage() {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) redirect('/admin/login');
  } catch {
    redirect('/admin/login');
  }
  return <ActivityClient />;
}
