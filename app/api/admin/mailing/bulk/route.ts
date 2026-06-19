// app/api/admin/mailing/bulk/route.ts
//
// POST — bulk operations on the mailing list.
// Body: { action: 'delete' | 'dedupe' | 'patch' | 'delete-all-in-segment' | 'move',
//         ids?: string[], segment?: string, target_segment?: string, ... }

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  dedupeSegment,
  deleteAllInSegment,
  deleteMailingContacts,
  isMailingSegment,
  segmentFromSlug,
  updateMailingContact,
  type MailingContactInput,
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

    if (action === 'patch') {
      // Bulk edit: apply the same partial update to every selected row.
      // Only fields present in `body.patch` are updated; everything else
      // is left as-is. Allowed string fields mirror the [id] PATCH route.
      const ids = Array.isArray(body.ids)
        ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'no valid ids' }, { status: 400 });
      }
      const patch = (body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch))
        ? (body.patch as Record<string, unknown>)
        : null;
      if (!patch) {
        return NextResponse.json({ error: 'patch object required' }, { status: 400 });
      }

      const stringFields: (keyof MailingContactInput)[] = [
        'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'license_number',
        'address', 'address_2', 'city', 'state', 'zip', 'website', 'notes', 'source',
      ];
      const input: MailingContactInput = {};
      for (const f of stringFields) {
        if (f in patch) {
          const v = patch[f];
          if (v === null || typeof v === 'string') {
            (input as Record<string, unknown>)[f] = v;
          }
        }
      }
      if (Array.isArray(patch.tags)) {
        input.tags = (patch.tags as unknown[]).filter((t): t is string => typeof t === 'string');
      }
      if (Object.keys(input).length === 0) {
        return NextResponse.json({ error: 'no allowed fields in patch' }, { status: 400 });
      }

      let updated = 0;
      const errors: { id: string; error: string }[] = [];
      for (const id of ids) {
        try {
          const row = await updateMailingContact(id, input);
          if (row) updated += 1;
          else errors.push({ id, error: 'not found' });
        } catch (err) {
          errors.push({ id, error: errMessage(err) });
        }
      }
      return NextResponse.json({ ok: true, updated, errors });
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

    if (action === 'move') {
      // Re-assign selected contacts to a different mailing segment.
      // Body: { action: 'move', ids: string[], target_segment: MailingSegment | slug }
      const ids = Array.isArray(body.ids)
        ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'no valid ids' }, { status: 400 });
      }
      const targetRaw = typeof body.target_segment === 'string' ? body.target_segment : null;
      const target = targetRaw && (isMailingSegment(targetRaw) ? targetRaw : segmentFromSlug(targetRaw));
      if (!target) {
        return NextResponse.json({ error: 'invalid target_segment' }, { status: 400 });
      }
      let moved = 0;
      const errors: { id: string; error: string }[] = [];
      for (const id of ids) {
        try {
          const row = await updateMailingContact(id, { segment: target });
          if (row) moved += 1;
          else errors.push({ id, error: 'not found' });
        } catch (err) {
          errors.push({ id, error: errMessage(err) });
        }
      }
      return NextResponse.json({ ok: true, moved, errors, target });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/mailing bulk]', errMessage(err));
    return NextResponse.json({ error: 'bulk action failed', detail: errMessage(err) }, { status: 500 });
  }
}
