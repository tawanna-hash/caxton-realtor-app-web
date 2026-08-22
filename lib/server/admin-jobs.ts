// lib/server/admin-jobs.ts
//
// Background-work primitives for bulk admin operations. A job is a small
// row in `admin_jobs` plus a worker function that flips its status from
// 'queued' → 'running' → 'done' (or 'failed'). The HTTP routes that
// enqueue jobs hand the worker off to Vercel's waitUntil() so the
// response can return immediately while the work continues. The UI then
// polls /api/admin/jobs/[id] for progress.
//
// We deliberately keep this thin — no Redis, no SQS, no cron-driven
// dispatcher. Vercel's waitUntil() gives us up to 5 min on Hobby and
// 15 min on Pro after the response is sent, which is more than enough
// for the bulk operations we currently need. If a worker process is
// killed mid-job (cold start, deploy, exceeded window), the row stays
// in 'running' state — operators see it in any future status query
// and can retry. A future sweep cron can mark dead 'running' rows as
// 'failed' after a TTL.

import { getSql } from '@/lib/db';

export type AdminJobKind =
  | 'mailing_bulk_delete'
  | 'mailing_bulk_move'
  | 'mailing_bulk_patch';

type AdminJobStatus = 'queued' | 'running' | 'done' | 'failed';

export type AdminJob = {
  id: string;
  kind: AdminJobKind;
  scope: Record<string, unknown>;
  params: Record<string, unknown>;
  status: AdminJobStatus;
  total: number | null;
  processed: number;
  error: string | null;
  created_by: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/** Insert a new job in 'queued' state. Returns the new row. */
export async function createAdminJob(opts: {
  kind: AdminJobKind;
  scope: Record<string, unknown>;
  params: Record<string, unknown>;
  createdBy?: string | null;
  estimatedTotal?: number;
}): Promise<AdminJob> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO admin_jobs (kind, scope, params, status, total, created_by)
    VALUES (
      ${opts.kind},
      ${JSON.stringify(opts.scope)}::jsonb,
      ${JSON.stringify(opts.params)}::jsonb,
      'queued',
      ${opts.estimatedTotal ?? null},
      ${opts.createdBy ?? null}::uuid
    )
    RETURNING *
  `) as unknown as AdminJob[];
  return rows[0];
}

export async function getAdminJob(id: string): Promise<AdminJob | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM admin_jobs WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as AdminJob[];
  return rows[0] ?? null;
}

async function markJobRunning(id: string, total?: number): Promise<void> {
  const sql = getSql();
  if (typeof total === 'number') {
    await sql`
      UPDATE admin_jobs
         SET status = 'running', started_at = NOW(), total = ${total}
       WHERE id = ${id}::uuid AND status = 'queued'
    `;
  } else {
    await sql`
      UPDATE admin_jobs
         SET status = 'running', started_at = NOW()
       WHERE id = ${id}::uuid AND status = 'queued'
    `;
  }
}

/** Increment processed count atomically. Called after each batch. */
async function bumpJobProgress(id: string, delta: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE admin_jobs
       SET processed = processed + ${delta}
     WHERE id = ${id}::uuid
  `;
}

async function markJobDone(id: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE admin_jobs
       SET status = 'done', finished_at = NOW()
     WHERE id = ${id}::uuid
  `;
}

async function markJobFailed(id: string, error: string): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE admin_jobs
       SET status = 'failed', finished_at = NOW(), error = ${error.slice(0, 500)}
     WHERE id = ${id}::uuid
  `;
}

/**
 * Run a job worker with try/catch and lifecycle bookkeeping. The worker
 * gets a `progress(delta)` callback to update the row as batches finish.
 * Caller is expected to wrap this in waitUntil() so it survives the
 * HTTP response returning.
 */
export async function runJob(
  jobId: string,
  worker: (progress: (delta: number) => Promise<void>) => Promise<void>,
  estimatedTotal?: number,
): Promise<void> {
  try {
    await markJobRunning(jobId, estimatedTotal);
    await worker(async (delta) => bumpJobProgress(jobId, delta));
    await markJobDone(jobId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error(`[admin-jobs] job ${jobId} failed:`, msg);
    try { await markJobFailed(jobId, msg); } catch (markErr) {
      console.error(`[admin-jobs] failed to mark job ${jobId} as failed:`, markErr);
    }
  }
}
