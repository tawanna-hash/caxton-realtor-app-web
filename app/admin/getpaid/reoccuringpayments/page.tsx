import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import type { RecurringScheduleWithAdvertiser } from '@/lib/recurring-invoices';
import type { AgreementWithAdvertiser } from '@/lib/agreements';
import type { AdvertiserOption } from '@/app/admin/billing/_components/types';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { RecurringPaymentsClient } from '../_components/RecurringPaymentsClient';

export const dynamic = 'force-dynamic';

export default async function RecurringPaymentsPage() {
  if (!(await getCurrentAdmin())) redirect('/admin/login');
  await ensureSchema();
  const sql = getSql();
  const [schedules, advertisers, agreements] = await Promise.all([
    sql`SELECT s.*, adv.name AS advertiser_name FROM recurring_invoice_schedules s LEFT JOIN advertisers adv ON adv.id = s.advertiser_id ORDER BY s.next_run_at ASC`.catch(() => [] as unknown[]),
    sql`SELECT id, name, publication FROM advertisers ORDER BY name ASC`.catch(() => [] as unknown[]),
    sql`SELECT ag.*, adv.name AS advertiser_name FROM agreements ag LEFT JOIN advertisers adv ON adv.id = ag.advertiser_id ORDER BY ag.updated_at DESC`.catch(() => [] as unknown[]),
  ]);
  return <RecurringPaymentsClient initialSchedules={schedules as unknown as RecurringScheduleWithAdvertiser[]} advertisers={advertisers as unknown as AdvertiserOption[]} agreements={agreements as unknown as AgreementWithAdvertiser[]} />;
}
