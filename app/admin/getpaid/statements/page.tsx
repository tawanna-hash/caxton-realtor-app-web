// app/admin/getpaid/statements/page.tsx
//
// Partner statement picker: lists every advertiser with at least one
// non-void, non-draft invoice and their current outstanding balance, so
// staff can jump straight to that partner's Statement of Account.
// Styled to match the invoice document (app/admin/invoices/[id]/preview).

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
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
      SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0))::int AS outstanding_cents,
      SUM(
        CASE WHEN i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE
          THEN GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0)
          ELSE 0 END
      )::int AS overdue_cents,
      COUNT(*) FILTER (
        WHERE GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0) > 0
      )::int AS open_invoice_count,
      history.last_sent_at,
      COALESCE(history.send_count, 0)::int AS send_count
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
      ORDER BY recent.created_at DESC, recent.id DESC
      LIMIT 1
    ) latest_bill ON true
    LEFT JOIN LATERAL (
      SELECT MAX(sent_at) AS last_sent_at, COUNT(*)::int AS send_count
      FROM statement_send_history
      WHERE advertiser_id = adv.id
    ) history ON true
    WHERE i.status NOT IN ('void', 'draft')
    GROUP BY adv.id, adv.name, latest_bill.bill_to_email, history.last_sent_at, history.send_count
    HAVING SUM(GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, 0), 0)) > 0
    ORDER BY overdue_cents DESC, outstanding_cents DESC
  `) as unknown as StatementPartnerRow[];

  const [paymentLinkInvoices, advertisers] = await Promise.all([
    sql`SELECT i.*, adv.name AS advertiser_name, false AS is_overdue FROM invoices i LEFT JOIN advertisers adv ON adv.id = i.advertiser_id ORDER BY i.created_at DESC`.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication, contact_email, billing_email FROM advertisers ORDER BY name ASC`.catch(() => [] as unknown[]),
  ]);

  return (
    <StatementsClient
      partners={partners}
      paymentLinkInvoices={paymentLinkInvoices as unknown as InvoiceWithAdvertiser[]}
      advertisers={advertisers as unknown as AdvertiserOption[]}
    />
  );
}
