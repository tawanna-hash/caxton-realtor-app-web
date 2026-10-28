// POST — create an Embedded Checkout session for the agreement's first payment.
// Body: { method: 'card' | 'bank' }. Public; the HMAC token is the auth.
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/sign-token';
import { isStripeConfigured } from '@/lib/stripe';
import { createAgreementCheckout } from '@/lib/server/agreement-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
  const { token } = await ctx.params;
  const v = verifyToken(token);
  if (!v) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { method?: string };
  try {
    const r = await createAgreementCheckout({
      agreementId: v.agreementId,
      method: body.method === 'bank' ? 'bank' : 'card',
      returnUrl: `${req.nextUrl.origin}/agree/${encodeURIComponent(token)}`,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ clientSecret: r.clientSecret, sessionId: r.sessionId, totalCents: r.totalCents });
  } catch (err) {
    console.error('[agree-v2/checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
