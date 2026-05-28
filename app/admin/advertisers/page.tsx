// app/admin/advertisers/page.tsx
//
// Admin page: list all advertisers, create/edit/delete, manage share tokens.
// Server component handles auth + initial data load; AdvertisersClient owns
// interactivity.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AdvertiserWithStats } from '@/lib/advertisers';
import AdvertisersClient from './AdvertisersClient';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function AdvertisersPage() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  await ensureSchema();
  const sql = getSql();

  const advertisers = (await sql`
    SELECT
      a.id, a.name, a.slug, a.share_token, a.contact_email,
      a.requires_email_gate, a.created_at, a.updated_at, a.publication,
      (SELECT COUNT(*) FROM magazine_hotspots h WHERE h.advertiser_id = a.id) AS hotspot_count,
      (SELECT COUNT(*) FROM magazine_hotspot_clicks c
         JOIN magazine_hotspots h ON c.hotspot_id = h.id
        WHERE h.advertiser_id = a.id
          AND c.occurred_at > NOW() - INTERVAL '30 days') AS clicks_30d
    FROM advertisers a
    ORDER BY a.name ASC
  `) as unknown as AdvertiserWithStats[];

  return <AdvertisersClient initialAdvertisers={advertisers} />;
}
