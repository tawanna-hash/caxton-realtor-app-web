// Temporary cleanup endpoint: delete old orphaned La Cima rows
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

  const results: Record<string, unknown> = {};

  // 1. Delete old La Cima showcase rows (builderName='La Cima', not the new ones with actual builder names)
  const deletedShowcase = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = 'La Cima'
      AND home_type = 'showcase'
      AND kind = 'listing'
    RETURNING id
  `;
  results.deletedOldShowcase = deletedShowcase.length;

  // 2. Delete old La Cima promotions (builderName='La Cima', kind='promotion')
  const deletedPromos = await sql`
    DELETE FROM builder_inventory
    WHERE builder_name = 'La Cima'
      AND kind = 'promotion'
    RETURNING id
  `;
  results.deletedOldPromos = deletedPromos.length;

  // 3. Update standalone Newmark Homes communities to roll up under La Cima developer
  const updatedNewmark = await sql`
    UPDATE builder_inventory
    SET developer_name = 'La Cima'
    WHERE builder_name = 'Newmark Homes'
      AND developer_name IS NULL
      AND kind = 'listing'
    RETURNING id
  `;
  results.newmarkRolledUp = updatedNewmark.length;

  // 4. Show remaining active rows grouped by builder
  const remaining = await sql`
    SELECT builder_name, developer_name, COUNT(*)::int as cnt
    FROM builder_inventory
    WHERE status = 'active'
      AND (developer_name = 'La Cima' OR builder_name = 'La Cima' OR builder_name = 'Newmark Homes')
    GROUP BY builder_name, developer_name
    ORDER BY builder_name
  `;
  results.remainingActive = remaining;

  return NextResponse.json({ ok: true, ...results });
}
