import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { deleteTrecDeal, getTrecDeal, updateTrecDeal } from '@/lib/server/trec-deals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

const dealSchema = z.object({
  title: z.string().trim().min(1).max(180),
  worksheet: z.record(z.string(), z.string().max(20_000)),
  addenda: z.record(z.string(), z.boolean()),
  status: z.enum(['active', 'closed', 'archived']).optional(),
});

function isReasonablePayload(value: unknown): boolean {
  return JSON.stringify(value).length <= 100_000;
}

async function getId(ctx: RouteCtx): Promise<string | null> {
  const { id } = await ctx.params;
  return UUID_RE.test(id) ? id : null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await getId(ctx);
  if (!id) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });

  try {
    const deal = await getTrecDeal(id);
    return deal
      ? NextResponse.json({ deal })
      : NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-deal GET]', error);
    return NextResponse.json({ error: 'Could not load this deal.' }, { status: 500 });
  }
}

export const PATCH = withAdminTracking(async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await getId(ctx);
  if (!id) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });

  const parsed = dealSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isReasonablePayload(parsed.data)) {
    return NextResponse.json({ error: 'Enter valid deal-prep details.' }, { status: 400 });
  }

  try {
    const deal = await updateTrecDeal(id, parsed.data);
    return deal
      ? NextResponse.json({ deal })
      : NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-deal PATCH]', error);
    return NextResponse.json({ error: 'Could not save this deal.' }, { status: 500 });
  }
});

export const DELETE = withAdminTracking(async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await getId(ctx);
  if (!id) return NextResponse.json({ error: 'Invalid deal id.' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (body?.confirmationId !== id) {
    return NextResponse.json({ error: 'Enter the saved deal ID to permanently delete it.' }, { status: 409 });
  }

  try {
    const deleted = await deleteTrecDeal(id);
    return deleted
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Deal not found.' }, { status: 404 });
  } catch (error) {
    console.error('[trec-deal DELETE]', error);
    return NextResponse.json({ error: 'Could not delete this deal.' }, { status: 500 });
  }
});
