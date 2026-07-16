import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;
  const rows = (await sql`
    SELECT * FROM marketing_campaign_outreach WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ row: rows[0] });
}
