// Admin switch: may this client pay a different amount than the full invoice or balance.
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { canPayPartial, setCanPayPartial } from '@/lib/server/partial-payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  return NextResponse.json({ allow: await canPayPartial(id) });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = await idOf(ctx);
  if (!id) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { allow?: unknown };
  if (typeof body.allow !== 'boolean') return NextResponse.json({ error: 'allow must be true or false' }, { status: 400 });
  await setCanPayPartial(id, body.allow);
  return NextResponse.json({ allow: body.allow });
}
