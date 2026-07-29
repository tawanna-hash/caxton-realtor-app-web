import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAdminTracking(async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const sql = getSql();
  const { id } = await params;

  const rootRows = (await sql`
    SELECT COALESCE(recurrence_parent_id, id) AS root_id
    FROM marketing_campaign_outreach WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as Array<{ root_id: string }>;
  if (rootRows.length === 0) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const rootId = rootRows[0].root_id;

  const cancelled = (await sql`
    UPDATE marketing_campaign_outreach
    SET status = 'cancelled', updated_at = now()
    WHERE status = 'scheduled'
      AND (id = ${rootId}::uuid OR recurrence_parent_id = ${rootId}::uuid)
    RETURNING id
  `) as unknown as Array<{ id: string }>;

  await sql`
    UPDATE marketing_campaign_outreach
    SET recurrence_until = now(), updated_at = now()
    WHERE id = ${rootId}::uuid
  `;

  return NextResponse.json({ ok: true, cancelled: cancelled.length, root_id: rootId });
});
