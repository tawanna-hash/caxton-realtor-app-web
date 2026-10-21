import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { ensureBusinessTables } from '@/lib/server/business-settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  await ensureBusinessTables();
  await getSql()`UPDATE admin_api_keys SET revoked_at = now() WHERE id = ${id} AND revoked_at IS NULL`;
  return NextResponse.json({ ok: true });
}
