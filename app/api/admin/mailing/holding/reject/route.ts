// app/api/admin/mailing/holding/reject/route.ts
//
// POST /api/admin/mailing/holding/reject
//   Body: { ids: string[] }
//   Hard-deletes holding rows. Will not touch rows already promoted to
//   stage='mailing' (the helper scopes the delete by stage).

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { rejectHoldingContacts } from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const idsRaw = (body && typeof body === 'object' && 'ids' in body) ? (body as { ids: unknown }).ids : null;
  const ids: string[] = Array.isArray(idsRaw)
    ? idsRaw.filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids required (uuid[])' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const removed = await rejectHoldingContacts(ids);
    return NextResponse.json({ ok: true, removed });
  } catch (err) {
    console.error('[admin/mailing/holding/reject]', errMessage(err));
    return NextResponse.json({ error: 'reject failed', detail: errMessage(err) }, { status: 500 });
  }
}
