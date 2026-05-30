// app/admin/billing/page.tsx
//
// Sales workspace: tabbed view of Agreements (contracts) and
// Invoices (billable charges). Server component fetches both lists
// in parallel.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import BillingClient from './BillingClient';

export const dynamic = 'force-dynamic';

async function isAdmin(): Promise<boolean> {
  try { return (await getCurrentAdmin()) !== null; } catch { return false; }
}

export default async function BillingPage() {
  if (!(await isAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();

  const [agreements, invoices, advertisers] = await Promise.all([
    sql`
      SELECT ag.*, adv.name AS advertiser_name,
        COALESCE((SELECT SUM(i.total_cents)::int FROM invoices i WHERE i.agreement_id = ag.id AND i.status <> 'void'), 0) AS invoiced_cents,
        COALESCE((SELECT SUM(i.total_cents)::int FROM invoices i WHERE i.agreement_id = ag.id AND i.status = 'paid'), 0) AS paid_cents
      FROM agreements ag
      LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id
      ORDER BY ag.updated_at DESC
    `,
    sql`
      SELECT i.*, adv.name AS advertiser_name,
        (i.status NOT IN ('paid','void') AND i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS is_overdue
      FROM invoices i
      LEFT JOIN advertisers adv ON adv.id = i.advertiser_id
      ORDER BY i.created_at DESC
    `,
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`,
  ]);

  return (
    <BillingClient
      initialAgreements={agreements as unknown as AgreementWithAdvertiser[]}
      initialInvoices={invoices as unknown as InvoiceWithAdvertiser[]}
      advertisers={advertisers as unknown as Array<{ id: number; name: string; publication: string }>}
    />
  );
}
