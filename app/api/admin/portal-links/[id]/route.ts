// app/api/admin/portal-links/[id]/route.ts
//
// DELETE — revoke a magic link (does NOT delete the row; sets revoked_at).
//          Use this to force logout or invalidate a not-yet-used link.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === 'string') reason = body.reason;
  } catch { /* ok */ }

  try {
    await ensureSchema();
    const sql = getSql();
    await sql`
      UPDATE portal_magic_links
      SET revoked_at = NOW(),
          revoked_reason = COALESCE(${reason}, 'revoked by admin'),
          session_expires_at = NULL
      WHERE id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'revoke failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
