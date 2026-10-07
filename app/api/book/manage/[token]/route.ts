import { NextResponse } from 'next/server';
import { cancelByToken } from '@/lib/server/closing-time-schedulers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Invitee cancels their own booking. Authorized only by the private link in their confirmation. */
export async function POST(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ok = await cancelByToken(token);
  return NextResponse.json(ok ? { ok: true } : { error: 'This booking can no longer be cancelled.' }, { status: ok ? 200 : 400 });
}
