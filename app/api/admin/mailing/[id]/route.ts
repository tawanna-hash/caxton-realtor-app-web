// app/api/admin/mailing/[id]/route.ts
//
// PATCH  — update a mailing contact
// DELETE — remove a mailing contact

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  deleteMailingContact,
  isMailingSegment,
  segmentFromSlug,
  updateMailingContact,
  type MailingContactInput,
  type MailingSegment,
} from '@/lib/mailing';

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
    const ok = await deleteMailingContact(id);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/mailing DELETE]', errMessage(err));
    return NextResponse.json({ error: 'delete failed', detail: errMessage(err) }, { status: 500 });
  }
}
