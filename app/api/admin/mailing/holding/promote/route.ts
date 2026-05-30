// app/api/admin/mailing/holding/promote/route.ts
//
// POST /api/admin/mailing/holding/promote
//   Body: { ids: string[] }
//   Promotes verified holding contacts to stage='mailing'. Rows that
//   are not verified (neither addr_status='Valid' nor email_status='Valid')
//   are skipped, as are rows whose email already exists in the active
//   mailing list.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { promoteHoldingContacts } from '@/lib/mailing';

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
    const result = await promoteHoldingContacts(ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin/mailing/holding/promote]', errMessage(err));
    return NextResponse.json({ error: 'promote failed', detail: errMessage(err) }, { status: 500 });
  }
}
