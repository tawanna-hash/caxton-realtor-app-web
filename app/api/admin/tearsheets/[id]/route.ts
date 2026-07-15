// app/api/admin/tearsheets/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server/auth/admin';
import { ensureSchema } from '@/lib/db';
import { deleteTearsheet, getTearsheet } from '@/lib/server/tearsheets-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;
  const ts = await getTearsheet(id);
  if (!ts) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ tearsheet: ts });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  await ensureSchema();
  const { id } = await ctx.params;
  const ok = await deleteTearsheet(id);
  return NextResponse.json({ ok });
}
