import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { PaymentLinksClient } from '../_components/PaymentLinksClient';

export const dynamic = 'force-dynamic';

export default async function PaymentLinksPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const [invoices, advertisers] = await Promise.all([
    sql`SELECT i.*, adv.name AS advertiser_name, false AS is_overdue FROM invoices i LEFT JOIN advertisers adv ON adv.id = i.advertiser_id ORDER BY i.created_at DESC`.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`.catch(() => [] as unknown[]),
  ]);
  return <PaymentLinksClient initialInvoices={invoices as unknown as InvoiceWithAdvertiser[]} advertisers={advertisers as unknown as AdvertiserOption[]} />;
}
