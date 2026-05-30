// app/api/admin/mailing/holding/verify/route.ts
//
// POST /api/admin/mailing/holding/verify
//   Body: { id: string, field: 'addr' | 'email', status?: 'Valid' | 'Invalid' | 'Pending' }
//   Marks a single holding row's address or email as verified / invalid.

import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import {
  markAddrVerified,
  markEmailVerified,
  type VerifyStatus,
} from '@/lib/mailing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

function isVerifyStatus(v: unknown): v is VerifyStatus {
  return v === 'Valid' || v === 'Invalid' || v === 'Pending';
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const field = body.field;
  const status: VerifyStatus = isVerifyStatus(body.status) ? body.status : 'Valid';

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'id must be uuid' }, { status: 400 });
  }
  if (field !== 'addr' && field !== 'email') {
    return NextResponse.json({ error: "field must be 'addr' or 'email'" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const ok = field === 'addr'
      ? await markAddrVerified(id, status)
      : await markEmailVerified(id, status);
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/mailing/holding/verify]', errMessage(err));
    return NextResponse.json({ error: 'verify failed', detail: errMessage(err) }, { status: 500 });
  }
}
