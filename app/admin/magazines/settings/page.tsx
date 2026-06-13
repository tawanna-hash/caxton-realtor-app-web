// app/admin/magazines/settings/page.tsx
//
// Server wrapper for publication-wide magazine settings. Currently
// holds the GA4 Measurement ID for each publication (RealtyLine /
// Newsline). Queries the DB directly — same pattern as the other
// admin pages, since self-fetch to /api/admin/publication-settings
// would lose the admin session cookie on Vercel's runtime.

import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { redirect } from 'next/navigation';
import PublicationSettingsForm, {
  type PublicationSettingsRow,
} from './PublicationSettingsForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Magazine Settings' };

async function fetchSettings(): Promise<PublicationSettingsRow[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT publication, ga_measurement_id, updated_at
      FROM publication_settings
     ORDER BY publication
  `) as unknown as PublicationSettingsRow[];
  return rows;
}

export default async function Page() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  const settings = await fetchSettings();
  return <PublicationSettingsForm initialSettings={settings} />;
}
