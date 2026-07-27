// app/api/admin/mailing/holding/verify-all-pending/route.ts
//
// POST /api/admin/mailing/holding/verify-all-pending
//   Body: { batchSize?: number, concurrency?: number, jobId?: string }
//
// Verifies one batch of email_status='Pending' contacts in the holding
// stage. Returns counts so the caller (manual drain orchestrator or
// Vercel cron) can decide whether to call again.
//
// Auth: accepts EITHER
//   • admin session cookie (manual UI invocation), OR
//   • `Authorization: Bearer $CRON_SECRET` (programmatic / cron), OR
//   • `x-vercel-cron: 1` (Vercel-scheduled invocation)
//
// If a `jobId` is supplied, after each contact is processed the matching
// row in verify_jobs is incremented so the UI polling endpoint sees
// live progress. The jobId-incrementing path is best-effort — failures
// to update the job row never abort verification work.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { persistEmailVerification } from '@/lib/mailing';
import { verifyEmail } from '@/lib/email-verify';
import { ApiError } from '@/lib/server/error';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { uuidSchema } from '@/lib/server/schemas/_common';

export const runtime     = 'nodejs';
export const dynamic     = 'force-dynamic';
export const maxDuration = 300; // 5 min — comfortably more than 150 × 6s with concurrency=10

interface PendingRow {
  id:    string;
  email: string;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function authorizedByCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

// Body schema for the batch worker. All fields optional with sane
// defaults so cron / fire-and-forget callers can POST {}.
const verifyBatchSchema = z
  .object({
    batchSize:   z.coerce.number().int().min(1).max(500).default(150),
    concurrency: z.coerce.number().int().min(1).max(25).default(10),
    jobId:       uuidSchema.optional(),
  })
  .partial()
  .default({});

export const POST = withAdminTracking(async (req: Request) => {
  // Auth: admin OR cron. We can't use `requireAdmin` directly because
  // the cron path is unauthenticated except for the bearer token.
  const admin = await getCurrentAdmin();
  const cron  = authorizedByCron(req);
  if (!admin && !cron) {
    throw new ApiError(401, 'unauthorized');
  }

  // Tolerate empty body (Vercel cron self-call sends `{}`).
  let bodyRaw: unknown = {};
  try {
    bodyRaw = await req.json();
  } catch {
    bodyRaw = {};
  }
  const parsed = verifyBatchSchema.parse(bodyRaw);
  const batchSize   = parsed.batchSize   ?? 150;
  const concurrency = parsed.concurrency ?? 10;
  const jobId       = parsed.jobId       ?? null;

  await ensureSchema();
  const sql = getSql();

  // Pull the next slice of Pending contacts that haven't been re-checked
  // within the last hour. The "not verified in last hour" gate prevents
  // chained cron runs from re-probing the same un-fixable addresses on
  // every loop. Order by oldest-verified-first so we work through the
  // backlog rather than thrashing the same rows.
  const rows = (await sql`
    SELECT id, email
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND email_status = 'Pending'
       AND email IS NOT NULL
       AND email <> ''
       AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))
     ORDER BY email_verified_at ASC NULLS FIRST, id ASC
     LIMIT ${batchSize}
  `) as unknown as PendingRow[];

  // Remaining count (for UI sizing / orchestrator stop condition).
  const remainingRows = (await sql`
    SELECT COUNT(*)::int AS n
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND email_status = 'Pending'
       AND email IS NOT NULL
       AND email <> ''
       AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))
  `) as unknown as { n: number }[];
  const remainingBeforeBatch = remainingRows[0]?.n ?? 0;

  if (rows.length === 0) {
    if (jobId) {
      await sql`UPDATE verify_jobs SET status = 'done', finished_at = NOW(), updated_at = NOW() WHERE id = ${jobId}::uuid AND status = 'running'`;
    }
    return NextResponse.json({
      ok:               true,
      processed:        0,
      valid:            0,
      invalid:          0,
      pending:          0,
      errors:           0,
      remaining_before: remainingBeforeBatch,
      remaining_after:  0,
      batch_size:       batchSize,
      concurrency,
    });
  }

  // If a job is being tracked and this is the first batch, set total.
  if (jobId) {
    await sql`
      UPDATE verify_jobs
         SET status = 'running',
             total  = GREATEST(total, processed + ${remainingBeforeBatch}::int),
             updated_at = NOW()
       WHERE id = ${jobId}::uuid
         AND status IN ('queued', 'running')
    `;
  }

  // Concurrency-bounded worker pool. Each task verifies one contact
  // and persists the result via the same code path the UI uses.
  let valid    = 0;
  let invalid  = 0;
  let pending  = 0;
  let errors   = 0;

  const queue = [...rows];
  async function worker() {
    while (queue.length > 0) {
      const r = queue.shift();
      if (!r) return;
      try {
        const result = await verifyEmail(r.email);
        // Same logic as /verify-email: a soft Pending shouldn't downgrade a previously-Valid row,
        // but since this query filters to Pending only, every result is safe to write directly.
        await persistEmailVerification(r.id, result.verdict, {
          verdict:    result.verdict,
          detail:     result.detail,
          risk:       result.risk,
          signals:    result.signals,
          mx:         result.mx,
          code:       result.code,
          suggestion: result.suggestion,
          normalized: result.normalized,
        });
        if (result.verdict === 'Valid')   valid   += 1;
        else if (result.verdict === 'Invalid') invalid += 1;
        else                              pending += 1;
      } catch (err) {
        errors += 1;
        // Don't crash the worker — log and keep going.
        console.error('[verify-all-pending] row', r.id, errMessage(err));
      }
      // Best-effort live progress: bump processed by 1 after each row
      // so the UI poll can show a moving counter. Final valid/invalid/
      // pending tallies are written in a single statement after the
      // pool drains.
      if (jobId) {
        try {
          await sql`
            UPDATE verify_jobs
               SET processed  = processed + 1,
                   updated_at = NOW()
             WHERE id = ${jobId}::uuid
          `;
        } catch {
          /* ignore per-row stat write failures */
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, () => worker());
  await Promise.all(workers);

  // Final counts update for the job row — atomic, definitive numbers.
  if (jobId) {
    await sql`
      UPDATE verify_jobs
         SET valid_count   = valid_count   + ${valid}::int,
             invalid_count = invalid_count + ${invalid}::int,
             pending_count = pending_count + ${pending}::int,
             last_error    = ${errors > 0 ? `${errors} row error(s) in last batch` : null},
             updated_at    = NOW()
       WHERE id = ${jobId}::uuid
    `;
  }

  const remainingAfterRows = (await sql`
    SELECT COUNT(*)::int AS n
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND email_status = 'Pending'
       AND email IS NOT NULL
       AND email <> ''
       AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))
  `) as unknown as { n: number }[];
  const remainingAfterBatch = remainingAfterRows[0]?.n ?? 0;

  return NextResponse.json({
    ok:               true,
    processed:        rows.length,
    valid,
    invalid,
    pending,
    errors,
    remaining_before: remainingBeforeBatch,
    remaining_after:  remainingAfterBatch,
    batch_size:       batchSize,
    concurrency,
  });
});
