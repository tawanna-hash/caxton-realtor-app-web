import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { createTrecDealDocument, getTrecDeal } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

const documentSchema = z.object({
  kind: z.string().trim().min(1).max(100),
  displayName: z.string().trim().min(1).max(240),
  notes: z.string().trim().max(2_000).nullable().optional(),
});

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });
  const parsed = documentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid document request.' }, { status: 400 });
  try {
    if (!(await getTrecDeal(id))) return NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
    const document = await createTrecDealDocument({ id: randomUUID(), dealId: id, ...parsed.data, actor: admin.email });
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('[trec-document POST]', error);
    return NextResponse.json({ error: 'Could not add this document request.' }, { status: 500 });
  }
});
