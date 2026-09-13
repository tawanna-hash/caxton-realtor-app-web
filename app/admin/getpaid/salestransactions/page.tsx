import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { SalesTransactionsClient } from '../_components/SalesTransactionsClient';

export const dynamic = 'force-dynamic';

export default async function SalesTransactionsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const invoices = await sql`
    SELECT i.*, adv.name AS advertiser_name,
      (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
    FROM invoices i LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
    ORDER BY i.created_at DESC
  `.catch(() => [] as unknown[]);
  return <SalesTransactionsClient invoices={invoices as unknown as InvoiceWithAdvertiser[]} />;
}
