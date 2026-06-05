// app/api/admin/mailing/bulk/route.ts
//
// POST — bulk operations on the mailing list.
// Body: { action: 'delete' | 'dedupe', ids?: string[], segment?: string }

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  dedupeSegment,
  deleteAllInSegment,
  deleteMailingContacts,
  isMailingSegment,
  segmentFromSlug,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const action = body.action;

  try {
    await ensureSchema();

    if (action === 'delete') {
      const ids = Array.isArray(body.ids)
        ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'no valid ids' }, { status: 400 });
      }
      const removed = await deleteMailingContacts(ids);
      return NextResponse.json({ ok: true, removed });
    }

    if (action === 'delete-all-in-segment') {
      const segRaw = typeof body.segment === 'string' ? body.segment : null;
      const segment = segRaw && (isMailingSegment(segRaw) ? segRaw : segmentFromSlug(segRaw));
      if (!segment) {
        return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
      }
      // Require an explicit confirm token so this can\u2019t be triggered by a
      // stray POST. The UI sends { confirm: 'DELETE_ALL' }.
      if (body.confirm !== 'DELETE_ALL') {
        return NextResponse.json({ error: 'confirm token required' }, { status: 400 });
      }
      const removed = await deleteAllInSegment(segment);
      return NextResponse.json({ ok: true, removed });
    }

    if (action === 'dedupe') {
      const segRaw = typeof body.segment === 'string' ? body.segment : null;
      const segment = segRaw && (isMailingSegment(segRaw) ? segRaw : segmentFromSlug(segRaw));
      if (!segment) {
        return NextResponse.json({ error: 'invalid segment' }, { status: 400 });
      }
      const result = await dedupeSegment(segment);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/mailing bulk]', errMessage(err));
    return NextResponse.json({ error: 'bulk action failed', detail: errMessage(err) }, { status: 500 });
  }
}
