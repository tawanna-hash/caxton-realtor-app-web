import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listTrecDealActivity } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });
  try {
    return NextResponse.json({ activity: await listTrecDealActivity(id) });
  } catch (error) {
    console.error('[trec-activity GET]', error);
    return NextResponse.json({ error: 'Could not load this activity history.' }, { status: 500 });
  }
}
