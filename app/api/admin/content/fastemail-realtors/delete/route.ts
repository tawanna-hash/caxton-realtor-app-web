import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { requireAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  await requireAdmin();
  await ensureSchema();
  const { ids } = await req.json() as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== 'string')) return NextResponse.json({ error: 'Provide between 1 and 500 record IDs.' }, { status: 400 });
  const sql = getSql();
  const deleted = await sql`DELETE FROM fastemail_realtor_imports WHERE id = ANY(${ids}::uuid[]) RETURNING id` as unknown as Array<{ id: string }> ;
  return NextResponse.json({ ok: true, deleted: deleted.length });
}
