import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { isStripeConfigured } from '@/lib/stripe';
import { completeClientSetup } from '@/lib/server/client-payment-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok || v.subject.kind !== 'client' || !isStripeConfigured()) return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const r = sessionId ? await completeClientSetup(v.subject.id, sessionId) : { ok: false, error: 'missing session' };
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
}
