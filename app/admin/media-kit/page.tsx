// app/admin/media-kit/page.tsx
//
// Admin → 2026 Media Kit reference page.
// Read-only port of the PressBook CRM "Packages" page, used by sales reps as
// a one-stop reference when filling out an Advertising Agreement in the
// admin drawer or talking to a prospect.

import { redirect } from 'next/navigation';
import { execFileSync } from 'node:child_process';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import MediaKitClient from './MediaKitClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'Media Kit · RealtyLine Austin Admin',
};

// Resolve the last-modified date of lib/media-kit.ts so the page can render a
// "Last synced from Media Kit on YYYY-MM-DD" banner. We use the committer date
// of the most recent commit touching the file (works on Vercel because the
// build step has full git history). If git is unavailable for any reason
// (e.g. shallow clone, future deploy target), we fall back to the build
// timestamp so the banner still renders.
function readLastSyncedISO(): string {
  try {
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', 'lib/media-kit.ts'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (out) return out;
  } catch {
    // fall through
  }
  return new Date().toISOString();
}

export default async function MediaKitPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');
  const lastSyncedISO = readLastSyncedISO();
  return <MediaKitClient lastSyncedISO={lastSyncedISO} />;
}
