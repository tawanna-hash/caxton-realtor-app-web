// app/api/admin/mailing/holding/verify-drain/status/route.ts
//
// GET /api/admin/mailing/holding/verify-drain/status?id=<job_uuid>
//   Returns the current state of a drain job for live UI polling.
//
// GET /api/admin/mailing/holding/verify-drain/status
//   (no id) Returns the most-recent active job, if any.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { parseQuery, uuidSchema } from '@/lib/server/schemas/_common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statusQuerySchema = z.object({
  id: uuidSchema.optional(),
});

interface JobRow {
  id:            string;
  kind:          'manual' | 'cron';
  status:        'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  total:         number;
  processed:     number;
  valid_count:   number;
  invalid_count: number;
  pending_count: number;
  last_error:    string | null;
  started_by:    string | null;
  started_at:    string;
  finished_at:   string | null;
  updated_at:    string;
}

export const GET = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  const sql = getSql();

  const { id } = parseQuery(req, statusQuerySchema);

  const rows: JobRow[] = id
    ? ((await sql`SELECT * FROM verify_jobs WHERE id = ${id}::uuid`) as unknown as JobRow[])
    : ((await sql`
        SELECT * FROM verify_jobs
         ORDER BY (status IN ('running','queued')) DESC, started_at DESC
         LIMIT 1
      `) as unknown as JobRow[]);

  const job = rows[0];
  if (!job) {
    return NextResponse.json({ ok: true, job: null });
  }

  // Live "remaining" count derived from mailing_contacts (more accurate
  // than total - processed, which can drift if cron and a manual drain
  // overlap).
  const remainingRows = (await sql`
    SELECT COUNT(*)::int AS n
      FROM mailing_contacts
     WHERE stage = 'holding'
       AND email_status = 'Pending'
       AND email IS NOT NULL
       AND email <> ''
       AND (email_verified_at IS NULL OR email_verified_at < (NOW() - INTERVAL '1 hour'))
  `) as unknown as { n: number }[];

  return NextResponse.json({
    ok:        true,
    job,
    remaining: remainingRows[0]?.n ?? 0,
  });
});
