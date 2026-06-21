// app/api/admin/jobs/[id]/route.ts
//
// GET — return current status + progress for an admin background job.
// The UI polls this every ~2s while a bulk operation is in flight.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getAdminJob } from '@/lib/server/admin-jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  await ensureSchema();
  const job = await getAdminJob(id);
  if (!job) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return NextResponse.json({
    id: job.id,
    kind: job.kind,
    status: job.status,
    total: job.total,
    processed: job.processed,
    error: job.error,
    created_at: job.created_at,
    started_at: job.started_at,
    finished_at: job.finished_at,
  });
}
