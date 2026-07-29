// app/api/admin/mailing/bulk/route.ts
//
// POST — bulk operations on the mailing list.
// Body: { action: 'delete' | 'dedupe' | 'patch' | 'delete-all-in-segment' | 'move',
//         ids?: string[], segment?: string, target_segment?: string, ... }

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
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
import { suppressEmailsBatch } from '@/lib/server/email-suppressions';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      // Snapshot emails + metadata BEFORE delete so the suppression list
      // captures every removed contact. Without this step the ABOR /
      // SABOR sync would silently re-insert these emails on the next
      // run.
      const sql = getSql();
      const snap = (await sql.query(
        `SELECT id, email, first_name, last_name, segment, stage, external_id, external_source
           FROM mailing_contacts WHERE id = ANY($1::uuid[]) AND email IS NOT NULL`,
        [ids],
      )) as Array<{
        id: string;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        segment: string | null;
        stage: string | null;
        external_id: string | null;
        external_source: string | null;
      }>;
      const removed = await deleteMailingContacts(ids);
      const suppressed = await suppressEmailsBatch(
        snap.map((r) => ({
          email: r.email,
          source_id: r.id,
          snapshot: {
            first_name: r.first_name,
            last_name: r.last_name,
            segment: r.segment,
            stage: r.stage,
            external_id: r.external_id,
            external_source: r.external_source,
          },
        })),
        {
          reason: 'admin_bulk_delete',
          source_table: 'mailing_contacts',
          suppressed_by: admin.email,
        },
      );
      return NextResponse.json({ ok: true, removed, suppressed });
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
      // Snapshot every email in the segment before the wipe.
      const sql = getSql();
      const snap = (await sql.query(
        `SELECT id, email FROM mailing_contacts
          WHERE segment = $1 AND email IS NOT NULL`,
        [segment],
      )) as Array<{ id: string; email: string | null }>;
      const removed = await deleteAllInSegment(segment);
      const suppressed = await suppressEmailsBatch(
        snap.map((r) => ({ email: r.email, source_id: r.id })),
        {
          reason: 'admin_bulk_delete',
          source_table: 'mailing_contacts',
          suppressed_by: admin.email,
        },
      );
      return NextResponse.json({ ok: true, removed, suppressed });
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

    if (action === 'tags') {
      // Bulk tag edit. Body:
      //   { action: 'tags', ids: string[], mode: 'add'|'remove'|'replace', tags: string[] }
      // - 'add': union the given tags into each row's existing tags (idempotent).
      // - 'remove': strip the given tags from each row's existing tags.
      // - 'replace': overwrite the tags array with exactly the given list.
      const ids = Array.isArray(body.ids)
        ? (body.ids as unknown[]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: 'no valid ids' }, { status: 400 });
      }
      const mode = body.mode;
      if (mode !== 'add' && mode !== 'remove' && mode !== 'replace') {
        return NextResponse.json({ error: "mode must be 'add', 'remove', or 'replace'" }, { status: 400 });
      }
      const tags = Array.isArray(body.tags)
        ? (body.tags as unknown[])
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];
      if (tags.length === 0 && mode !== 'replace') {
        return NextResponse.json({ error: 'tags array required' }, { status: 400 });
      }
      const sql = getSql();
      const tagsJson = JSON.stringify(tags);
      let updated = 0;
      if (mode === 'add') {
        const rows = (await sql.query(
          `UPDATE mailing_contacts
              SET tags = COALESCE((
                    SELECT jsonb_agg(DISTINCT t)
                      FROM jsonb_array_elements_text(
                        COALESCE(tags, '[]'::jsonb) || $2::jsonb
                      ) AS t
                  ), '[]'::jsonb)
            WHERE id = ANY($1::uuid[])
          RETURNING id`,
          [ids, tagsJson],
        )) as Array<{ id: string }>;
        updated = rows.length;
      } else if (mode === 'remove') {
        const rows = (await sql.query(
          `UPDATE mailing_contacts
              SET tags = COALESCE((
                    SELECT jsonb_agg(t)
                      FROM jsonb_array_elements_text(COALESCE(tags, '[]'::jsonb)) AS t
                     WHERE NOT (t = ANY($2::text[]))
                  ), '[]'::jsonb)
            WHERE id = ANY($1::uuid[])
          RETURNING id`,
          [ids, tags],
        )) as Array<{ id: string }>;
        updated = rows.length;
      } else {
        const rows = (await sql.query(
          `UPDATE mailing_contacts
              SET tags = $2::jsonb
            WHERE id = ANY($1::uuid[])
          RETURNING id`,
          [ids, tagsJson],
        )) as Array<{ id: string }>;
        updated = rows.length;
      }
      return NextResponse.json({ ok: true, updated, mode, tags });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[admin/mailing bulk]', errMessage(err));
    return NextResponse.json({ error: 'bulk action failed', detail: errMessage(err) }, { status: 500 });
  }
});
