/**
 * /api/admin/billing/notifications
 *   GET — counts for the admin billing badge.
 *
 * Returns the number of active/signed/sent agreements expiring within
 * the next 30 days, plus an overdue invoice count. The Billing nav item
 * surfaces an amber dot when expiring > 0 OR overdue > 0.
 *
 * Returns:
 *   {
 *     expiring30: number,
 *     overdue:    number,
 *     total:      number  // expiring30 + overdue
 *   }
 *
 * Polled from <BillingAlertsBadge /> every ~60s. Fails open with zeros.
 * Auth: requireAdmin().
 */

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { ensureSchema, getSql } from '@/lib/db';

export const runtime = 'nodejs';

interface CountRow { n: number }

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();

  const sql = getSql();

  let expiring30 = 0;
  let overdue = 0;

  // Expiring agreements: still active (not cancelled/expired) AND
  // exp_date (or end_date) falls within today..today+30d.
  try {
    const rows = (await sql`
      SELECT count(*)::int AS n
        FROM agreements
       WHERE status IN ('active', 'signed', 'sent')
         AND COALESCE(exp_date, end_date) IS NOT NULL
         AND COALESCE(exp_date, end_date) >= CURRENT_DATE
         AND COALESCE(exp_date, end_date) <= (CURRENT_DATE + INTERVAL '30 days')
    `) as unknown as CountRow[];
    expiring30 = rows[0]?.n ?? 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[billing-notifications] expiring fail-open: ${msg}`);
  }

  // Overdue invoices: issued (status='sent' — drafts aren't overdue yet)
  // past due_date. Drafts are excluded: they aren't issued, so a stale draft
  // with an old due_date shouldn't inflate the billing badge.
  try {
    const rows = (await sql`
      SELECT count(*)::int AS n
        FROM invoices
       WHERE status NOT IN ('paid', 'void', 'draft')
         AND due_date IS NOT NULL
         AND due_date < CURRENT_DATE
    `) as unknown as CountRow[];
    overdue = rows[0]?.n ?? 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[billing-notifications] overdue fail-open: ${msg}`);
  }

  return NextResponse.json({
    expiring30,
    overdue,
    total: expiring30 + overdue,
  });
});
