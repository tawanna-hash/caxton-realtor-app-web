// app/admin/agreements/renewals-v2/new/page.tsx
//
// Agreements (Beta): Anchor-style single-page agreement builder. Runs alongside
// the live agreement tools; sending uses the same quote and new-partner flow.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import BuilderClient from './BuilderClient';

export const dynamic = 'force-dynamic';

export default async function BuilderPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  return <BuilderClient />;
}
