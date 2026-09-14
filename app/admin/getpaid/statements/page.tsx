// app/admin/getpaid/statements/page.tsx
//
// Partner statement picker: lists every advertiser with at least one
// non-void, non-draft invoice and their current outstanding balance, so
// staff can jump straight to that partner's Statement of Account.
// Styled to match the invoice document (app/admin/invoices/[id]/preview).

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import StatementsClient, { type StatementPartnerRow } from './StatementsClient';

export const dynamic = 'force-dynamic';

export default async function StatementsIndexPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  const partners = (await sql`
    SELECT
      adv.id AS advertiser_id,
      adv.name AS advertiser_name,
      COALESCE(
        NULLIF(TRIM(adv.billing_email), ''),
        NULLIF(TRIM(latest_bill.bill_to_email), ''),
        NULLIF(TRIM(adv.contact_email), ''),
        NULLIF(TRIM(adv.portal_email), '')
      ) AS recipient_email,
      SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0))::int AS outstanding_cents,
      SUM(
        CASE WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
          THEN GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)
          ELSE 0 END
      )::int AS overdue_cents,
      COUNT(*) FILTER (
        WHERE GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0) > 0
      )::int AS open_invoice_count
    FROM invoices i
    JOIN advertisers adv ON adv.id = i.advertiser_id
    LEFT JOIN LATERAL (
      SELECT SUM(p.amount_cents)::int AS amount_paid_cents
      FROM invoice_payments p WHERE p.invoice_id = i.id
    ) pay ON true
    LEFT JOIN LATERAL (
      SELECT bill_to_email
      FROM invoices recent
      WHERE recent.advertiser_id = adv.id
        AND NULLIF(TRIM(recent.bill_to_email), '') IS NOT NULL
      ORDER BY recent.created_at DESC
      LIMIT 1
    ) latest_bill ON true
    WHERE i.status NOT IN ('void', 'draft')
    GROUP BY adv.id, adv.name, latest_bill.bill_to_email
    HAVING SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)) > 0
    ORDER BY overdue_cents DESC, outstanding_cents DESC
  `.catch(() => [] as unknown[])) as unknown as StatementPartnerRow[];

  return <StatementsClient partners={partners} />;
}
