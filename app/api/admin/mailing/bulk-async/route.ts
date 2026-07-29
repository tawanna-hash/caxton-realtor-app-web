// app/api/admin/mailing/bulk-async/route.ts
//
// POST — kick off a bulk operation against a FILTER (segment + search) that
// might match thousands of rows. Returns immediately with a job_id; the
// actual work runs via Vercel's waitUntil() and updates the admin_jobs
// row as it goes. UI polls /api/admin/jobs/[id] for progress.
//
// Body:
//   { action: 'delete' | 'move',
//     scope: { segment: string, query?: string, filter?: 'all'|'verified'|'pending' },
//     target_segment?: string,    // required for 'move'
//     expected_count: number,     // sanity check
//     confirm: 'BULK_FILTER'      // anti-misfire token
//   }
//
// Returns: { job_id, estimated_total }

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  createAdminJob,
  runJob,
  type AdminJobKind,
} from '@/lib/server/admin-jobs';
import {
  isMailingSegment,
  segmentFromSlug,
  type MailingSegment,
} from '@/lib/server/mailing/segments';
import { suppressEmailsBatch } from '@/lib/server/email-suppressions';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH_SIZE = 200;

function resolveSegment(raw: unknown): MailingSegment | null {
  if (typeof raw !== 'string') return null;
  return isMailingSegment(raw) ? raw : segmentFromSlug(raw);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (body.confirm !== 'BULK_FILTER') {
    return NextResponse.json({ error: 'confirm token required' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'delete' && action !== 'move') {
    return NextResponse.json({ error: 'unsupported action' }, { status: 400 });
  }

  const scopeIn = body.scope && typeof body.scope === 'object' && !Array.isArray(body.scope)
    ? (body.scope as Record<string, unknown>) : null;
  if (!scopeIn) return NextResponse.json({ error: 'scope required' }, { status: 400 });

  const segment = resolveSegment(scopeIn.segment);
  if (!segment) return NextResponse.json({ error: 'invalid segment' }, { status: 400 });

  const query = typeof scopeIn.query === 'string' ? scopeIn.query.trim() : '';
  const filter = scopeIn.filter === 'verified' || scopeIn.filter === 'pending'
    ? scopeIn.filter as 'verified' | 'pending'
    : 'all';

  const expectedCount = typeof body.expected_count === 'number'
    ? Math.max(0, Math.floor(body.expected_count)) : 0;

  let targetSegment: MailingSegment | null = null;
  if (action === 'move') {
    targetSegment = resolveSegment(body.target_segment);
    if (!targetSegment) {
      return NextResponse.json({ error: 'invalid target_segment' }, { status: 400 });
    }
    if (targetSegment === segment) {
      return NextResponse.json({ error: 'target_segment must differ from source' }, { status: 400 });
    }
  }

  await ensureSchema();

  // Sanity check: count actual matches now, before kicking off the worker.
  // If the count is drastically different from what the UI claimed, bail —
  // protects against stale UI state racing a concurrent import.
  const sql = getSql();
  const search_like = query ? `%${query.toLowerCase()}%` : null;
  const countRows = (search_like
    ? await sql`
        SELECT COUNT(*)::int AS n FROM mailing_contacts
         WHERE segment = ${segment} AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )
           AND (
             LOWER(COALESCE(first_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(last_name, '')) LIKE ${search_like}
             OR LOWER(COALESCE(email, ''))     LIKE ${search_like}
             OR LOWER(COALESCE(company, ''))   LIKE ${search_like}
             OR LOWER(COALESCE(city, ''))      LIKE ${search_like}
             OR LOWER(COALESCE(state, ''))     LIKE ${search_like}
             OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${search_like}
           )`
    : await sql`
        SELECT COUNT(*)::int AS n FROM mailing_contacts
         WHERE segment = ${segment} AND stage = 'mailing'
           AND (
             ${filter} = 'all'
             OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
             OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                        AND (email_status IS NULL OR email_status <> 'Valid'))
           )`
  ) as unknown as { n: number }[];
  const actualTotal = countRows[0]?.n ?? 0;

  if (actualTotal === 0) {
    return NextResponse.json({ error: 'no rows match this scope' }, { status: 400 });
  }
  if (expectedCount > 0) {
    const drift = Math.abs(actualTotal - expectedCount) / Math.max(expectedCount, 1);
    if (drift > 0.1) {
      return NextResponse.json({
        error: 'scope count drifted >10% since selection',
        expected: expectedCount,
        actual: actualTotal,
      }, { status: 409 });
    }
  }

  const kind: AdminJobKind = action === 'delete'
    ? 'mailing_bulk_delete'
    : 'mailing_bulk_move';

  const job = await createAdminJob({
    kind,
    scope: { segment, query, filter },
    params: action === 'move' ? { target_segment: targetSegment } : {},
    createdBy: admin.adminId,
    estimatedTotal: actualTotal,
  });

  // Hand off to background. Note: scope is captured here so even if the
  // mailing table changes between request return and worker start, the
  // worker uses the exact filter we counted against.
  waitUntil(runJob(job.id, async (progress) => {
    const sqlW = getSql();
    const sl = query ? `%${query.toLowerCase()}%` : null;

    // Page through matching IDs in batches and apply the action. We
    // re-query each batch from offset 0 because deletions/moves shrink
    // the matching set — keeping offset at 0 guarantees we never skip.
    // For a stable cursor we order by created_at DESC, id DESC.
    while (true) {
      const batchRows = (sl
        ? await sqlW`
            SELECT id, email FROM mailing_contacts
             WHERE segment = ${segment} AND stage = 'mailing'
               AND (
                 ${filter} = 'all'
                 OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
                 OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                            AND (email_status IS NULL OR email_status <> 'Valid'))
               )
               AND (
                 LOWER(COALESCE(first_name, '')) LIKE ${sl}
                 OR LOWER(COALESCE(last_name, '')) LIKE ${sl}
                 OR LOWER(COALESCE(email, ''))     LIKE ${sl}
                 OR LOWER(COALESCE(company, ''))   LIKE ${sl}
                 OR LOWER(COALESCE(city, ''))      LIKE ${sl}
                 OR LOWER(COALESCE(state, ''))     LIKE ${sl}
                 OR REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g') LIKE ${sl}
               )
             ORDER BY created_at DESC, id DESC
             LIMIT ${BATCH_SIZE}`
        : await sqlW`
            SELECT id, email FROM mailing_contacts
             WHERE segment = ${segment} AND stage = 'mailing'
               AND (
                 ${filter} = 'all'
                 OR (${filter} = 'verified' AND (addr_status = 'Valid' OR email_status = 'Valid'))
                 OR (${filter} = 'pending'  AND (addr_status  IS NULL OR addr_status  <> 'Valid')
                                            AND (email_status IS NULL OR email_status <> 'Valid'))
               )
             ORDER BY created_at DESC, id DESC
             LIMIT ${BATCH_SIZE}`
      ) as unknown as { id: string; email: string | null }[];

      if (batchRows.length === 0) break;
      const ids = batchRows.map((r) => r.id);

      if (action === 'delete') {
        // Tombstone the emails first so the next ABOR / SABOR sync
        // won't re-insert them. We do this BEFORE the delete so a
        // worker crash mid-batch never leaves rows deleted without
        // a corresponding suppression entry.
        await suppressEmailsBatch(
          batchRows.map((r) => ({ email: r.email, source_id: r.id })),
          {
            reason: 'admin_bulk_delete',
            source_table: 'mailing_contacts',
            suppressed_by: admin.email,
          },
        );
        await sqlW`DELETE FROM mailing_contacts WHERE id = ANY(${ids}::uuid[])`;
      } else {
        await sqlW`
          UPDATE mailing_contacts
             SET segment = ${targetSegment}, updated_at = NOW()
           WHERE id = ANY(${ids}::uuid[])`;
      }
      await progress(batchRows.length);
    }
  }, actualTotal).catch((err) => {
    // runJob already marks the row as failed; this catch just keeps
    // the promise from going unhandled in the waitUntil() context.
    console.error('[bulk-async] worker error:', errMessage(err));
  }));

  return NextResponse.json({
    job_id: job.id,
    estimated_total: actualTotal,
  });
});
