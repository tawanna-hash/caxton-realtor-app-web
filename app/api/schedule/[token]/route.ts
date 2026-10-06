import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitVotes } from '@/lib/server/closing-time-polls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const body = z.object({
  votes: z.record(z.string().uuid(), z.enum(['yes', 'maybe', 'no'])),
  comment: z.string().max(500).default(''),
});

/** Public poll answer. Authorized only by the invitee's unguessable link. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose an answer for each time.' }, { status: 400 });
  const result = await submitVotes(token, parsed.data.votes, parsed.data.comment);
  return NextResponse.json(result.ok ? { ok: true } : { error: result.error }, { status: result.ok ? 200 : 400, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}
