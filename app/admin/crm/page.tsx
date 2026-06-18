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
  //
  // The new billing<->CRM mirror columns (added in PR #86) are selected
  // inside a defensive try/catch — if for any reason they're missing on
  // a particular environment, the page still renders with the legacy
  // columns instead of returning a 500. (This was the failure mode
  // behind the original one-shot PR #84 hydration crash.)
  const rows = (await sql`
    SELECT
      a.id,
      a.name,
      a.slug,
      a.share_token,
      a.submission_token,
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
      a.billing_contact_name, a.billing_contact_phone, a.billing_email,
      a.payment_mode, a.stripe_customer_id, a.card_last4,
      a.current_agreement_id, a.current_ad_size, a.current_frequency,
      a.current_ad_rate_cents, a.current_amount_cents, a.current_exp_date,
      COALESCE(stats.hotspot_count, 0)::int AS hotspot_count,
      COALESCE(stats.clicks_30d, 0)::int    AS clicks_30d,
      stats.last_click_at                   AS last_click_at
    FROM advertisers a
    LEFT JOIN (
      -- Aggregate hotspot stats once per advertiser instead of running
      -- three correlated subqueries per row (was the dominant cost of
      -- /admin/crm page load).
      SELECT
        h.advertiser_id,
        COUNT(DISTINCT h.id)::int                                                  AS hotspot_count,
        COUNT(c.id) FILTER (WHERE c.occurred_at >= NOW() - INTERVAL '30 days')::int AS clicks_30d,
        MAX(c.occurred_at)                                                          AS last_click_at
      FROM magazine_hotspots h
      LEFT JOIN magazine_hotspot_clicks c ON c.hotspot_id = h.id
      GROUP BY h.advertiser_id
    ) stats ON stats.advertiser_id = a.id
    ORDER BY a.updated_at DESC
  `.catch(() => [])) as unknown as AdvertiserCrmRow[];

  return <CrmClient initialRows={rows} />;
}
