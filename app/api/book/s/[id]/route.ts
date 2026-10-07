import { NextResponse } from 'next/server';
import { publicSubmitLimited } from '@/lib/server/rate-limit';
import { z } from 'zod';
import { createBooking, publicSlots } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const nostore = { 'Cache-Control': 'private, no-store, max-age=0' };

/** Open times for one month: ?length=60&month=2026-10 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const month = url.searchParams.get('month') ?? '';
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Bad month' }, { status: 400 });
  const slots = await publicSlots(id, Number(url.searchParams.get('length')) || 0, month);
  if (!slots) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ slots }, { headers: nostore });
}

const body = z.object({
  start: z.number().int(), length: z.number().int().min(5).max(480),
  name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320),
  answers: z.record(z.string(), z.string().max(1000)).default({}),
});

/** Public booking. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await publicSubmitLimited('book');
  if (limited) return limited as never;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your name and a valid email.' }, { status: 400 });
  const r = await createBooking(id, { ...parsed.data, origin: new URL(req.url).origin });
  return NextResponse.json(r, { status: r.ok ? 200 : 400, headers: nostore });
}
