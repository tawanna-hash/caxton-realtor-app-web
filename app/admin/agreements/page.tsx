// app/admin/agreements/page.tsx
//
// Agreements workspace: contracts, renewals, and the sign-wizard pipeline.
// Sibling page to /admin/invoices. Server component fetches agreements +
// the supporting advertiser / ad-campaign / renewal-reminder data.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { RenewalReminder } from '@/lib/types/renewal-reminder';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import AgreementsClient from './AgreementsClient';
import type { AdCampaignOption } from '@/app/admin/billing/_components/types';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}

export default async function AgreementsPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  // Invoices are still selected (lightweight) because the agreement KPIs and
  // money summary depend on invoiced/paid totals + AR/overdue. They are not
  // editable from this page — that's /admin/invoices.
  const [agreements, invoices, advertisers, adCampaigns, renewalReminders] = await Promise.all([
    sql`
      SELECT ag.*, adv.name AS advertiser_name,
        COALESCE((SELECT SUM(i.total_cents)::int FROM invoices i WHERE i.agreement_id = ag.id AND i.status <> 'void'), 0) AS invoiced_cents,
        COALESCE((
          SELECT SUM(p.amount_cents)::int
          FROM invoice_payments p
          JOIN invoices i ON i.id = p.invoice_id
          WHERE i.agreement_id = ag.id AND i.status <> 'void'
        ), 0) AS paid_cents
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `.catch(() => [] as unknown[]),
    sql`
      SELECT i.id, i.status, i.total_cents, i.paid_at, i.due_date,
        COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
        GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
        COALESCE(pay.paid_mtd_cents, 0)::int AS paid_mtd_cents,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN LATERAL (
        SELECT
          SUM(p.amount_cents)::int AS amount_paid_cents,
          SUM(p.amount_cents) FILTER (
            WHERE p.payment_date >= date_trunc('month', CURRENT_DATE)::date
          )::int AS paid_mtd_cents
        FROM invoice_payments p
        WHERE p.invoice_id = i.id
      ) pay ON true
      ORDER BY i.created_at DESC
    `.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`
      .catch(() => [] as unknown[]),
    sql`
      SELECT id, advertiser_name, ad_space_slug, publication,
             start_date, end_date, active, advertiser_id, agreement_id
        FROM ad_campaigns
       ORDER BY created_at DESC
    `.catch(() => [] as unknown[]),
    sql`SELECT * FROM renewal_reminders ORDER BY remind_date ASC`
      .catch(() => [] as unknown[]),
  ]);

  return (
    <AgreementsClient
      initialAgreements={agreements as unknown as AgreementWithAdvertiser[]}
      initialInvoicesLite={invoices as unknown as Array<{
        id: string; status: string; total_cents: number | null;
        paid_at: string | null; due_date: string | null; is_overdue: boolean;
        amount_paid_cents: number; balance_cents: number; paid_mtd_cents: number;
      }>}
      advertisers={advertisers as unknown as Array<{ id: number; name: string; publication: string }>}
      adCampaigns={adCampaigns as unknown as AdCampaignOption[]}
      initialRenewalReminders={renewalReminders as unknown as RenewalReminder[]}
    />
  );
}
