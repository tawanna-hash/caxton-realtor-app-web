// app/api/admin/mailing/holding/verify-drain/start/route.ts
//
// POST /api/admin/mailing/holding/verify-drain/start
//   Body: { batchSize?: number }
//
// Creates a verify_jobs row in 'running' state and returns its id. The
// client (HoldingClient) then loops POST /verify-all-pending with the
// returned jobId until remaining_after === 0, polling /verify-drain/status
// between batches to drive the live progress bar.
//
// We deliberately do NOT spawn a long-running background task here —
// Vercel serverless functions don't keep work alive past the response.
// The pattern is: client kicks off, client drives the loop, client
// observes progress. If the user navigates away mid-drain, the every-
// 6-hour cron picks up wherever they left off.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';
import { parseJson } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const startSchema = z
  .object({
    batchSize: z.coerce.number().int().min(1).max(500).default(150),
  })
  .partial()
  .default({});

export const POST = withErrorHandling(async (req: Request) => {
  const admin = await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const { batchSize = 150 } = await parseJson(req, startSchema);

  // Compute the initial total so the progress bar has a denominator
  // immediately, before the first batch runs.
  const totalRows = (await sql`
    SELECT COUNT(*)::int AS n
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND email_status = 'Pending'
       AND email IS NOT NULL
       AND email <> ''
       AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))
  `) as unknown as { n: number }[];
  const total = totalRows[0]?.n ?? 0;

  // Reject if there's already an active drain (running or queued) to
  // avoid double-driving the same queue from two browser tabs.
  const existing = (await sql`
    SELECT id, total FROM verify_jobs WHERE status IN ('queued', 'running') LIMIT 1
  `) as unknown as { id: string; total: number }[];
  if (existing.length > 0) {
    // Include both `job_id` (client-canonical) and the legacy
    // `existing_job_id` key so anything depending on the old field
    // keeps working through the rollout.
    return NextResponse.json(
      {
        ok: false,
        error: 'drain_already_running',
        job_id: existing[0].id,
        existing_job_id: existing[0].id,
        total: existing[0].total,
      },
      { status: 409 },
    );
  }

  const startedBy =
    (admin as { email?: string; name?: string }).email ??
    (admin as { name?: string }).name ?? null;

  const created = (await sql`
    INSERT INTO verify_jobs (kind, status, total, started_by)
    VALUES ('manual', 'running', ${total}, ${startedBy})
    RETURNING id, total, started_at
  `) as unknown as { id: string; total: number; started_at: string }[];

  const job = created[0];
  return NextResponse.json({
    ok:         true,
    job_id:     job.id,
    total:      job.total,
    started_at: job.started_at,
    batch_size: batchSize,
  });
});
