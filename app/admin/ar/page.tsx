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
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
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
      SELECT to_char(date_trunc('day', paid_at), 'YYYY-MM-DD') AS day, SUM(total_cents)::bigint AS total_cents
      FROM invoices
      WHERE status = 'paid' AND paid_at IS NOT NULL AND paid_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY 1 ORDER BY 1 ASC
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
