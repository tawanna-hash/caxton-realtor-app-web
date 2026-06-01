// app/admin/media-kit/page.tsx
//
// Admin → 2026 Media Kit reference page.
// Read-only port of the PressBook CRM "Packages" page, used by sales reps as
// a one-stop reference when filling out an Advertising Agreement in the
// admin drawer or talking to a prospect.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import MediaKitClient from './MediaKitClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Media Kit · RealtyLine Austin Admin',
};

export default async function MediaKitPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  return <MediaKitClient />;
}
