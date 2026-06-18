// app/admin/notifications/page.tsx
//
// Admin · Notifications. Lists every notification (most recent first)
// with delivery stats, and exposes a "New notification" button that opens
// a compose modal for sending a web push to all realtors / a market.

import { redirect } from 'next/navigation';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import PageTitle from '@/components/ui/PageTitle';
import NotificationsClient from './NotificationsClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Row {
  id: string;
  category: string;
  title: string;
  body: string;
  deep_link_url: string | null;
  target_audience: { market?: string; channels?: string[] } | null;
  scheduled_for: string | null;
  sent_at: string | null;
  status: string;
  created_at: string;
  delivered_count: number;
  clicked_count: number;
}

interface SubStats {
  total: number;
  austin: number;
  san_antonio: number;
  houston: number;
  dallas: number;
  unspecified: number;
}

export default async function AdminNotificationsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/admin/login');

  await ensureSchema();
  const sql = getSql();

  const notifications = (await sql`
    SELECT n.id, n.category, n.title, n.body, n.deep_link_url,
           n.target_audience, n.scheduled_for, n.sent_at, n.status,
           n.created_at,
           COALESCE((SELECT COUNT(*)::int FROM notification_deliveries d
                      WHERE d.notification_id = n.id AND d.delivered_at IS NOT NULL), 0)
             AS delivered_count,
           COALESCE((SELECT COUNT(*)::int FROM notification_deliveries d
                      WHERE d.notification_id = n.id AND d.clicked_at IS NOT NULL), 0)
             AS clicked_count
      FROM notifications n
     ORDER BY n.created_at DESC
     LIMIT 100
  `) as unknown as Row[];

  const statsRows = (await sql`
    SELECT COALESCE(market, 'unspecified') AS bucket, COUNT(*)::int AS n
      FROM push_subscriptions
     WHERE revoked_at IS NULL
     GROUP BY bucket
  `) as unknown as Array<{ bucket: string; n: number }>;

  const stats: SubStats = {
    total: 0,
    austin: 0,
    san_antonio: 0,
    houston: 0,
    dallas: 0,
    unspecified: 0,
  };
  for (const r of statsRows) {
    stats.total += r.n;
    if (r.bucket === 'austin') stats.austin = r.n;
    else if (r.bucket === 'san_antonio') stats.san_antonio = r.n;
    else if (r.bucket === 'houston') stats.houston = r.n;
    else if (r.bucket === 'dallas') stats.dallas = r.n;
    else stats.unspecified = r.n;
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8 sm:mb-10">
        <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Admin · Content
        </div>
        <PageTitle size="md">Notifications</PageTitle>
        <p className="text-gray-600 mt-2">
          Send a web push to realtors who have opted in. Filter by market or send to everyone.
        </p>
      </header>
      <NotificationsClient initialNotifications={notifications} initialStats={stats} />
    </main>
  );
}
