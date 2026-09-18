// app/api/cron/refresh-payment-links/route.ts
//
// Hourly cron that silently refreshes Stripe Checkout Sessions before they
// expire, so an advertiser's "Pay invoice" link never goes dead between
// visits.
//
// Background: Stripe Checkout Sessions expire ~24h after creation by
// default (app/api/admin/invoices/[id]/payment-link/route.ts does not pass
// expires_at, so the default applies). Nothing previously refreshed a link
// proactively — invoices kept showing a live-looking "Open link" button in
// the admin UI long after the underlying session had died, which is what
// happened to the batch of Sep 14 invoices this cron is meant to prevent
// from recurring.
//
// Behavior:
//   Every hour, find invoices that are still owed money (status IN
//   ('sent','overdue')) whose most recent invoice_checkout_sessions row is
//   'open' and was created 20+ hours ago (4h safety buffer before the 24h
//   Stripe default expiry). Regenerate each one via the same
//   createInvoiceCheckoutSession() helper the manual "Create payment link"
//   admin button uses, with sendEmail: false — this is a silent background
//   swap of the stored URL, not a customer-facing event.
//
// Auth: CRON_SECRET bearer token OR x-vercel-cron header (same pattern as
// /api/cron/expire-promotions).
//
// Idempotency: refreshing calls invalidateInvoiceCheckoutSessions first, so
// a re-run this same hour (Vercel retry, etc.) just replaces the row again
// with a fresh 0h-old session — it will not be picked up again until it
// crosses 20h, so double-refreshing within a run is a correctness non-issue,
// just a wasted Stripe call in the rare retry case.

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { createInvoiceCheckoutSession } from '@/lib/server/invoice-payment-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Refresh once the live session is this many hours old — comfortably
// before Stripe's ~24h default Checkout Session expiry.
const REFRESH_AFTER_HOURS = 20;

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

interface EligibleInvoice {
  invoice_id: string;
  number: string;
  session_age_hours: number;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();
  const sql = getSql();

  // For each invoice, look only at its most recent checkout session
  // (DISTINCT ON ... ORDER BY created_at DESC). Only 'open' sessions are
  // refresh candidates — 'creating'/'failed'/'expired'/'complete' rows mean
  // there's no live link to protect, or the invoice already has no active
  // session for some other reason the manual flow should handle.
  const eligible = (await sql`
    SELECT i.id AS invoice_id, i.number,
           EXTRACT(EPOCH FROM (NOW() - latest.created_at)) / 3600 AS session_age_hours
      FROM invoices i
      JOIN LATERAL (
        SELECT created_at, status
          FROM invoice_checkout_sessions
         WHERE invoice_id = i.id
         ORDER BY created_at DESC
         LIMIT 1
      ) latest ON true
     WHERE i.status IN ('sent', 'overdue')
       AND latest.status = 'open'
       AND latest.created_at < NOW() - (${REFRESH_AFTER_HOURS} || ' hours')::interval
  `) as unknown as EligibleInvoice[];

  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, refreshed: 0, failed: 0 });
  }

  const refreshed: string[] = [];
  const failed: { invoice: string; error: string }[] = [];

  for (const row of eligible) {
    try {
      await createInvoiceCheckoutSession({
        invoiceId: row.invoice_id,
        createdBy: 'cron:refresh-payment-links',
        sendEmail: false,
      });
      refreshed.push(row.number);
    } catch (err) {
      failed.push({
        invoice: row.number,
        error: err instanceof Error ? err.message : 'unknown error',
      });
      console.error('[cron/refresh-payment-links]', row.number, err);
    }
  }

  return NextResponse.json({
    ok: true,
    checked: eligible.length,
    refreshed: refreshed.length,
    refreshedInvoices: refreshed,
    failed: failed.length,
    failures: failed,
  });
}
