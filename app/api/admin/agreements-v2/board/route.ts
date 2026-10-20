// app/api/admin/agreements-v2/board/route.ts — Agreements (Beta) status board (read-only).

import { NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listBoard } from '@/lib/agreements-v2/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    return NextResponse.json({ items: await listBoard(getSql()) });
  } catch (err) {
    return NextResponse.json({ error: 'board failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
