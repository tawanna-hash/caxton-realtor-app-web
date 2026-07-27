/**
 * GET /api/admin/notifications/subscribers
 *
 * Returns every push subscription (active and revoked) with human-friendly
 * fields for the admin UI: market, user agent, created/last-seen timestamps,
 * realtor link, and whether it's currently active.
 *
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubscriberRow {
  id: string;
  realtor_id: string | null;
  realtor_name: string | null;
  realtor_email: string | null;
  market: string | null;
  endpoint: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
}

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const rows = (await sql`
    SELECT ps.id,
           ps.realtor_id,
           NULLIF(TRIM(CONCAT_WS(' ', r.first_name, r.last_name)), '') AS realtor_name,
           r.email::text AS realtor_email,
           ps.market,
           ps.endpoint,
           ps.user_agent,
           ps.created_at,
           ps.last_seen_at,
           ps.revoked_at
      FROM push_subscriptions ps
      LEFT JOIN realtors r ON r.id = ps.realtor_id
     ORDER BY (ps.revoked_at IS NULL) DESC, ps.created_at DESC
     LIMIT 500
  `) as unknown as SubscriberRow[];

  const subscribers = rows.map((r) => ({
    id: r.id,
    realtorId: r.realtor_id,
    realtorName: r.realtor_name,
    realtorEmail: r.realtor_email,
    market: r.market,
    endpointHost: (() => {
      try {
        return new URL(r.endpoint).host;
      } catch {
        return null;
      }
    })(),
    userAgent: r.user_agent,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
    active: r.revoked_at === null,
  }));

  return NextResponse.json({ subscribers });
});
