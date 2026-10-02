// MillionVerifier bulk file jobs.
//   POST { emails, label? } -> uploads the list, creates a job
//   GET                      -> recent jobs (refreshes progress; applies finished ones)
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { applyReport, ensureBulkJobsTable, fileInfo, uploadEmails } from '@/lib/server/mv-bulk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schema = z.object({
  emails: z.array(z.string().trim().max(320)).min(1).max(50000),
  label: z.string().max(80).optional(),
});

type Job = {
  id: number; file_id: string; label: string; total: number; status: string;
  percent: number; applied_at: string | null; summary: Record<string, number> | null; created_at: string;
};

export const POST = withAdminTracking(async (req: Request) => {
  await requireAdmin();
  await ensureSchema();
  await ensureBulkJobsTable();
  const body = schema.parse(await req.json());
  const emails = Array.from(new Set(body.emails.map((e) => e.toLowerCase()).filter((e) => EMAIL_RE.test(e))));
  if (emails.length === 0) return NextResponse.json({ ok: false, error: 'No valid emails to send.' }, { status: 400 });
  const fileId = await uploadEmails(emails);
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO mv_bulk_jobs (file_id, label, total) VALUES (${fileId}, ${body.label ?? ''}, ${emails.length})
    RETURNING id`) as unknown as Array<{ id: number }>;
  return NextResponse.json({ ok: true, id: rows[0]?.id, total: emails.length });
});

export const GET = withAdminTracking(async () => {
  await requireAdmin();
  await ensureSchema();
  await ensureBulkJobsTable();
  const sql = getSql();
  let jobs = (await sql`SELECT * FROM mv_bulk_jobs ORDER BY id DESC LIMIT 10`) as unknown as Job[];
  for (const j of jobs) {
    if (j.applied_at || j.status === 'canceled') continue;
    try {
      const info = await fileInfo(j.file_id);
      if (info.status === 'finished') {
        const summary = await applyReport(j.file_id);
        await sql`UPDATE mv_bulk_jobs SET status = 'finished', percent = 100, applied_at = NOW(), summary = ${summary}::jsonb WHERE id = ${j.id}`;
      } else {
        await sql`UPDATE mv_bulk_jobs SET status = ${info.status}, percent = ${info.percent} WHERE id = ${j.id}`;
      }
    } catch (e) {
      await sql`UPDATE mv_bulk_jobs SET summary = ${{ error: e instanceof Error ? e.message : 'error' }}::jsonb WHERE id = ${j.id}`;
    }
  }
  jobs = (await sql`SELECT * FROM mv_bulk_jobs ORDER BY id DESC LIMIT 10`) as unknown as Job[];
  return NextResponse.json({ ok: true, jobs });
});
