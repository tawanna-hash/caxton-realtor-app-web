// app/admin/crm/page.tsx
//
// CRM view of advertisers. Same underlying `advertisers` table as
// /admin/advertisers, but presented as a contact-relationship workspace:
// search + filter, status pills, contact details, last-touch metric.
//
// Server component handles auth + initial data load.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AdvertiserCrmRow } from '@/lib/advertisers';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import CrmClient from './CrmClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export default async function CrmPage() {
  if (!(await isAdmin())) {
    redirect('/admin/login');
  }

  await ensureSchema();
  const sql = getSql();

  // Single query joins all CRM stats. COALESCE on the new columns so
  // rows from before the migration applied (none, but defensive) still
  // render with sane defaults.
  const rows = (await sql`
    SELECT
      a.id,
      a.name,
      a.slug,
      a.share_token,
      a.contact_email,
      a.requires_email_gate,
      a.publication,
      a.created_at,
      a.updated_at,
      COALESCE(a.type, 'advertiser')        AS type,
      COALESCE(a.status, 'active')          AS status,
      a.first_name, a.last_name, a.company, a.title, a.industry,
      a.license_number, a.avatar_url,
      a.portal_email, a.phone, a.office_phone, a.website,
      a.email_status, a.email_verified_at,
      a.address, a.address_2, a.city, a.state, a.zip,
      a.portal_activated_at, a.portal_onboarded_at,
      COALESCE(a.additional_contacts, '[]'::jsonb) AS additional_contacts,
      a.notes,
      COALESCE(a.tags, '[]'::jsonb)         AS tags,
      (SELECT COUNT(*)::int FROM magazine_hotspots h
        WHERE h.advertiser_id = a.id)       AS hotspot_count,
      (SELECT COUNT(*)::int FROM magazine_hotspot_clicks c
         JOIN magazine_hotspots h ON c.hotspot_id = h.id
        WHERE h.advertiser_id = a.id
          AND c.occurred_at >= NOW() - INTERVAL '30 days') AS clicks_30d,
      (SELECT MAX(c.occurred_at) FROM magazine_hotspot_clicks c
         JOIN magazine_hotspots h ON c.hotspot_id = h.id
        WHERE h.advertiser_id = a.id)       AS last_click_at
    FROM advertisers a
    ORDER BY a.updated_at DESC
  `) as unknown as AdvertiserCrmRow[];

  return <CrmClient initialRows={rows} />;
}
