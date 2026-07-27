// Temporary cleanup endpoint: delete old orphaned La Cima showcase rows
// that have no externalId (from before the scraper rebuild).
// DELETE after use.
import { NextResponse, type NextRequest } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function verifyCronAuth(req: NextRequest): boolean {
  const isProduction = process.env.VERCEL_ENV === 'production';
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get('authorization');
  if (!isProduction) return true;
  if (!expected) return false;
  return got === `Bearer ${expected}`;
}

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const deleted = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = 'La Cima'
      AND home_type = 'showcase'
      AND kind = 'listing'
    RETURNING id
  `;

  const remaining = await sql`
    SELECT builder_name, COUNT(*)::int as cnt
    FROM builder_inventory
    WHERE developer_name = 'La Cima'
      AND status = 'active'
    GROUP BY builder_name
    ORDER BY builder_name
  `;

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    deletedIds: deleted.map((r: Record<string, any>) => r.id),
    remainingActive: remaining,
  });
}
