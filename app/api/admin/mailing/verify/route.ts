// app/api/admin/mailing/verify/route.ts
//
// Mailing List HUB email verifier.
//   GET  -> verification stats across the hub's lists
//   POST -> { batchSize?, concurrency? } verifies the next batch of
//           unverified app-subscriber + newsletter emails (unified store)
//
// Holding-stage contacts (ABOR / SABOR) are verified through the existing
// /api/admin/mailing/holding/verify-all-pending route; the hub UI calls both.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { pickPendingEmails, verifyBatch } from '@/lib/server/email-verifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function stats() {
  const sql = getSql();
  const [unified, subs, holding, mailing] = await Promise.all([
    sql`SELECT status, COUNT(*)::int AS n FROM email_verifications GROUP BY status`,
    sql`
      WITH src AS (
        SELECT lower(email) AS email FROM realtors
         WHERE email IS NOT NULL AND email <> '' AND status IS DISTINCT FROM 'inactive'
        UNION
        SELECT lower(email) FROM newsletter_subscribers
         WHERE email IS NOT NULL AND email <> '' AND status IS DISTINCT FROM 'unsubscribed'
      )
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE ev.email IS NULL OR ev.verified_at IS NULL
                                 OR ev.verified_at < NOW() - INTERVAL '180 days')::int AS unverified
        FROM src s LEFT JOIN email_verifications ev ON ev.email = s.email`,
    sql`
      SELECT COUNT(*)::int AS n FROM mailing_contacts
       WHERE stage = 'holding' AND email_status = 'Pending'
         AND email IS NOT NULL AND email <> ''
         AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))`,
    sql`
      SELECT COALESCE(email_status, 'Unchecked') AS status, COUNT(*)::int AS n
        FROM mailing_contacts WHERE stage = 'mailing' AND email IS NOT NULL AND email <> ''
       GROUP BY 1`,
  ]);
  const toMap = (rows: unknown) =>
    Object.fromEntries((rows as Array<{ status: string; n: number }>).map((r) => [r.status, r.n]));
  const s = (subs as unknown as Array<{ total: number; unverified: number }>)[0] ?? { total: 0, unverified: 0 };
  return {
    unified: toMap(unified),
    subscribers: { total: s.total, unverified: s.unverified },
    holdingPending: (holding as unknown as Array<{ n: number }>)[0]?.n ?? 0,
    mailing: toMap(mailing),
  };
}

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  return NextResponse.json({ ok: true, ...(await stats()) });
});

const bodySchema = z
  .object({
    batchSize: z.coerce.number().int().min(1).max(100).default(40),
    concurrency: z.coerce.number().int().min(1).max(10).default(6),
  })
  .partial()
  .default({});

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  let raw: unknown = {};
  try { raw = await req.json(); } catch { raw = {}; }
  const { batchSize = 40, concurrency = 6 } = bodySchema.parse(raw);

  const emails = await pickPendingEmails(batchSize);
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, remaining: 0 });
  }
  const { verified, skipped } = await verifyBatch(emails, concurrency);
  const s = await stats();
  return NextResponse.json({
    ok: true,
    processed: verified,
    skipped,
    remaining: s.subscribers.unverified,
  });
});
