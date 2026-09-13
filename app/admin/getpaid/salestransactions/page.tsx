import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { SalesTransactionsClient } from '../_components/SalesTransactionsClient';

export const dynamic = 'force-dynamic';

export default async function SalesTransactionsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const [invoices, advertisers, agreements] = await Promise.all([
    sql`
      SELECT i.*, adv.name AS advertiser_name,
        (i.status NOT IN ('paid','void','draft') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      ORDER BY i.created_at DESC
    `.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`
      .catch(() => [] as unknown[]),
    sql`
      SELECT ag.*, adv.name AS advertiser_name
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `.catch(() => [] as unknown[]),
  ]);
  return (
    <SalesTransactionsClient
      initialInvoices={invoices as unknown as InvoiceWithAdvertiser[]}
      advertisers={advertisers as unknown as AdvertiserOption[]}
      agreements={agreements as unknown as AgreementWithAdvertiser[]}
    />
  );
}
