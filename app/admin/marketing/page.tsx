// app/admin/marketing/page.tsx
//
// Server component: auth check + initial campaign list with stats.
// Hands off to MarketingClient for interactivity.

import { redirect } from 'next/navigation';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getSql, ensureSchema } from '@/lib/db';
import type { MarketingCampaignWithStats } from '@/lib/marketing-campaigns';
import MarketingClient from './MarketingClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MarketingPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  await ensureSchema();
  const sql = getSql();

  const campaigns = (await sql`
    SELECT
      c.id, c.name, c.status, c.type, c.audience_filter, c.brief, c.goal,
      c.start_date, c.end_date, c.publication, c.created_by, c.created_at, c.updated_at,
      COALESCE((SELECT COUNT(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = c.id), 0) AS task_count,
      COALESCE((SELECT COUNT(*)::int FROM marketing_campaign_tasks t WHERE t.campaign_id = c.id AND t.status = 'done'), 0) AS task_done,
      COALESCE((SELECT COUNT(*)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = c.id AND o.status = 'sent'), 0) AS outreach_sent,
      COALESCE((SELECT SUM(o.recipient_count)::int FROM marketing_campaign_outreach o WHERE o.campaign_id = c.id AND o.status = 'sent'), 0) AS recipients_total
    FROM marketing_campaigns c
    ORDER BY
      CASE c.status
        WHEN 'active' THEN 0
        WHEN 'planning' THEN 1
        WHEN 'draft' THEN 2
        WHEN 'completed' THEN 3
        WHEN 'archived' THEN 4
        ELSE 5
      END,
      c.updated_at DESC
  `) as unknown as MarketingCampaignWithStats[];

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Admin · Marketing
        </div>
        <h1 className="font-serif text-3xl text-gray-900">
          Campaign workspace
        </h1>
        <p className="text-gray-600 mt-2">
          Plan outreach, track tasks, and preview audience before sending.
        </p>
      </header>
      <MarketingClient initial={campaigns} adminEmail={admin.email ?? null} />
    </main>
  );
}
