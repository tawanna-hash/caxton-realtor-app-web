// app/admin/invoices/page.tsx
//
// Invoices workspace: billable charges and payment status. Sibling to
// /admin/agreements. Server component fetches invoices + supporting
// advertiser / agreement options for the create drawer.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import InvoicesClient from './InvoicesClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}

export default async function InvoicesPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  const [invoices, agreements, advertisers] = await Promise.all([
    sql`
      SELECT i.*, adv.name AS advertiser_name,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      ORDER BY i.created_at DESC
    `.catch(() => [] as unknown[]),
    sql`
      SELECT ag.*, adv.name AS advertiser_name
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`
      .catch(() => [] as unknown[]),
  ]);

  return (
    <InvoicesClient
      initialInvoices={invoices as unknown as InvoiceWithAdvertiser[]}
      agreements={agreements as unknown as AgreementWithAdvertiser[]}
      advertisers={advertisers as unknown as Array<{ id: number; name: string; publication: string }>}
    />
  );
}
