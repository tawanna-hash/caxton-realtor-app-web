import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/server/error';
import { chooseTime, publicRequest, submitTimes } from '@/lib/server/closing-time-closing-schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const priv = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('times'), slots: z.array(z.object({ date: z.string().max(10), time: z.string().max(5) })).min(1).max(20), durationMin: z.number().min(15).max(480), location: z.string().max(300).default(''), note: z.string().max(1000).default('') }),
  z.object({ action: z.literal('choose'), index: z.number().int().min(0).max(19) }),
]);

export const GET = withErrorHandling(async (_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> => {
  const r = await publicRequest((await ctx.params).token);
  return r ? priv(r) : priv({ error: 'This link is not valid.' }, 404);
});

export const POST = withErrorHandling(async (req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> => {
  const { token } = await ctx.params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return priv({ error: parsed.error.issues[0]?.message ?? 'Check the form.' }, 400);
  const origin = new URL(req.url).origin;
  if (parsed.data.action === 'times') { await submitTimes(token, { ...parsed.data, origin }); return priv({ ok: true }); }
  return priv({ ok: true, ...(await chooseTime(token, parsed.data.index)) });
});
