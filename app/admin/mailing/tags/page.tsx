// app/admin/mailing/tags/page.tsx
//
// Tag library admin shell. Auth + schema bootstrap only. The table itself
// is loaded client-side from /api/admin/mailing/tags.

import { redirect } from 'next/navigation';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import TagsClient from './TagsClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function TagsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  return <TagsClient />;
}
