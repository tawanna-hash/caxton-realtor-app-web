// app/admin/advertisers/page.tsx
//
// Admin page: list all advertisers, create/edit/delete, manage share tokens.
// Server component handles auth + initial data load; AdvertisersClient owns
// interactivity.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ensureSchema, getSql } from '@/lib/db';
import type { AdvertiserWithStats } from '@/lib/advertisers';
import AdvertisersClient from './AdvertisersClient';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

async function getAdminEmail(cookieHeader: string): Promise<string | null> {
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET', headers: { cookie: cookieHeader }, cache: 'no-store',
    });
    if (!r.ok) return null;
    const data = await r.json();
    return typeof data?.email === 'string' ? data.email : null;
  } catch { return null; }
}

export default async function AdvertisersPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const adminEmail = await getAdminEmail(cookieHeader);
  if (!adminEmail) {
    redirect('/admin/login');
  }

  await ensureSchema();
  const sql = getSql();

  const advertisers = (await sql`
    SELECT
      a.id, a.name, a.slug, a.share_token, a.contact_email,
      a.requires_email_gate, a.created_at, a.updated_at,
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
