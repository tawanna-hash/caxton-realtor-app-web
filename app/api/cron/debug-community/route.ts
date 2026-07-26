// TEMPORARY debug route — verifies communityData.homePlans backfill.
// Remove after use.
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const sql = neon(process.env.DATABASE_URL!);
  const title = req.nextUrl.searchParams.get('title') ?? 'Caliterra';
  const rows = await sql`
    SELECT id, title, external_id, community_data->'homePlans' AS home_plans,
           jsonb_array_length(coalesce(community_data->'homePlans', '[]'::jsonb)) AS plan_count
    FROM builder_inventory
    WHERE builder_name = 'Drees Homes' AND home_type = 'community' AND title ILIKE ${'%' + title + '%'}
  `;
  return NextResponse.json({ rows });
}
