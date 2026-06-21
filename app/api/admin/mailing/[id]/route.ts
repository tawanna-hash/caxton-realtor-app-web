// app/api/admin/mailing/[id]/route.ts
//
// PATCH  — update a mailing contact
// DELETE — remove a mailing contact

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  deleteMailingContact,
  isMailingSegment,
  segmentFromSlug,
  updateMailingContact,
  type MailingContactInput,
  type MailingSegment,
} from '@/lib/mailing';
import { suppressEmail } from '@/lib/server/email-suppressions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function resolveSegment(raw: unknown): MailingSegment | null {
  if (typeof raw !== 'string') return null;
  if (isMailingSegment(raw)) return raw;
  return segmentFromSlug(raw);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const input: MailingContactInput = {};
    if ('segment' in body) {
      const seg = resolveSegment(body.segment);
      if (seg) input.segment = seg;
    }
    const stringFields: (keyof MailingContactInput)[] = [
      'first_name', 'last_name', 'email', 'phone', 'company', 'title', 'license_number',
      'address', 'address_2', 'city', 'state', 'zip', 'website', 'notes', 'source',
    ];
    for (const f of stringFields) {
      if (f in body) {
        const v = body[f];
        if (v === null || typeof v === 'string') {
          (input as Record<string, unknown>)[f] = v;
        }
      }
    }
    if ('advertiser_id' in body) {
      const v = body.advertiser_id;
      if (v === null || typeof v === 'number') input.advertiser_id = v;
    }
    if (Array.isArray(body.tags)) {
      input.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === 'string');
    }

    const row = await updateMailingContact(id, input);
    if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    console.error('[admin/mailing PATCH]', errMessage(err));
    return NextResponse.json({ error: 'update failed', detail: errMessage(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  try {
    await ensureSchema();
    // Snapshot the row BEFORE delete so we can record the email +
    // source metadata into the permanent suppression list. This makes
    // the delete permanent: future ABOR / SABOR / subscribe re-imports
    // will skip this email instead of silently re-inserting it.
    const sql = getSql();
    const snap = (await sql.query(
      `SELECT id, email, first_name, last_name, segment, stage, external_id, external_source
         FROM mailing_contacts WHERE id = $1 LIMIT 1`,
      [id],
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
    const row = snap[0] ?? null;

    const ok = await deleteMailingContact(id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });

    let suppressed = false;
    if (row?.email) {
      suppressed = await suppressEmail({
        email: row.email,
        reason: 'admin_delete',
        source_table: 'mailing_contacts',
        source_id: row.id,
        source_snapshot: {
          first_name: row.first_name,
          last_name: row.last_name,
          segment: row.segment,
          stage: row.stage,
          external_id: row.external_id,
          external_source: row.external_source,
        },
        suppressed_by: admin.email,
      });
    }
    return NextResponse.json({ ok: true, suppressed });
  } catch (err) {
    console.error('[admin/mailing DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
