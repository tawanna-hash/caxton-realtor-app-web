import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSignView, submitSignature, declineSignature } from '@/lib/server/closing-time-esign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sign'), consent: z.boolean(), marks: z.record(z.string().max(60), z.object({ kind: z.enum(['typed', 'drawn']), value: z.string().max(300_000) })) }),
  z.object({ action: z.literal('decline'), reason: z.string().max(500).optional() }),
]);
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' };
const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const view = await getSignView((await ctx.params).token);
  return view ? NextResponse.json(view, { headers: noStore }) : NextResponse.json({ error: 'This link is not valid.' }, { status: 404, headers: noStore });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: noStore });
  const ctxInfo = { ip: ipOf(req), ua: req.headers.get('user-agent') ?? '' };
  if (parsed.data.action === 'decline') {
    const r = await declineSignature(token, parsed.data.reason ?? '', ctxInfo);
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 400, headers: noStore });
  }
  const r = await submitSignature(token, { consent: parsed.data.consent, marks: parsed.data.marks }, ctxInfo);
  return NextResponse.json(r.ok ? r : { error: r.error }, { status: r.ok ? 200 : 400, headers: noStore });
}
