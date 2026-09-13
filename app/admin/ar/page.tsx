// app/admin/ar/page.tsx
//
// Accounts Receivable dashboard: aging buckets, outstanding-by-advertiser,
// and the recurring-invoice schedule manager (agreement-linked + standalone).
// Sibling to /admin/invoices — that page stays the flat invoice list/editor;
// this page is the AR-manager view on top of the same `invoices` table plus
// `recurring_invoice_schedules`.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import ArClient from './ArClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}

export default async function ArDashboardPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  const [invoices, schedules, advertisers, agreements, monthlyIncome] = await Promise.all([
    sql`
      SELECT i.*, adv.name AS advertiser_name,
        COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END)::int AS amount_paid_cents,
        GREATEST(i.total_cents - COALESCE(pay.amount_paid_cents, CASE WHEN i.status = 'paid' THEN i.total_cents ELSE 0 END), 0)::int AS balance_cents,
        COALESCE(pay.payments, '[]'::jsonb) AS payments,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      LEFT JOIN LATERAL (
        SELECT sum(p.amount_cents)::int AS amount_paid_cents,
          jsonb_agg(to_jsonb(p) ORDER BY p.payment_date, p.created_at) AS payments
        FROM invoice_payments p WHERE p.invoice_id = i.id
      ) pay ON true
      WHERE i.status NOT IN ('void')
      ORDER BY i.due_date ASC NULLS LAST
    `.catch(() => [] as unknown[]),
    sql`
      SELECT s.*, adv.name AS advertiser_name
      FROM recurring_invoice_schedules s
      LEFT JOIN advertisers adv ON adv.id = s.advertiser_id
      ORDER BY s.next_run_at ASC
    `.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`
      .catch(() => [] as unknown[]),
    sql`
      SELECT ag.*, adv.name AS advertiser_name
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `.catch(() => [] as unknown[]),
    sql`
      WITH income_events AS (
        SELECT p.payment_date::date AS day, p.amount_cents
        FROM invoice_payments p
        WHERE p.payment_date >= date_trunc('year', CURRENT_DATE) - INTERVAL '2 years'

        UNION ALL

        SELECT i.paid_at::date AS day, i.total_cents AS amount_cents
        FROM invoices i
        WHERE i.status = 'paid'
          AND i.paid_at IS NOT NULL
          AND i.paid_at >= date_trunc('year', CURRENT_DATE) - INTERVAL '2 years'
          AND NOT EXISTS (
            SELECT 1 FROM invoice_payments p WHERE p.invoice_id = i.id
          )
      )
      SELECT to_char(day, 'YYYY-MM-DD') AS day, SUM(amount_cents)::int AS total_cents
      FROM income_events
      GROUP BY day
      ORDER BY day ASC
    `.catch(() => [] as unknown[]),
  ]);

  return (
    <ArClient
      initialInvoices={invoices as unknown as InvoiceWithAdvertiser[]}
      initialSchedules={schedules as unknown as RecurringScheduleWithAdvertiser[]}
      advertisers={advertisers as unknown as Array<{ id: number; name: string; publication: string }>}
      agreements={agreements as unknown as AgreementWithAdvertiser[]}
      incomeByDay={monthlyIncome as unknown as Array<{ day: string; total_cents: number }>}
    />
  );
}
