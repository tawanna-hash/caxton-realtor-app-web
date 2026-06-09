// app/admin/mailing/holding/page.tsx
//
// Holding contacts staging page. Server-side: auth check + initial
// shell. Data lives in the client component.

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import HoldingClient from './HoldingClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function MailingHoldingPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Loading…</div>}>
      <HoldingClient />
    </Suspense>
  );
}
