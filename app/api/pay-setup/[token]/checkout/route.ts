import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { isStripeConfigured } from '@/lib/stripe';
import { createClientSetupCheckout } from '@/lib/server/client-payment-setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
  const { token } = await ctx.params;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok || v.subject.kind !== 'client') return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { method?: string };
  try {
    const r = await createClientSetupCheckout(v.subject.id, body.method === 'card' ? 'card' : body.method === 'bank' ? 'bank' : 'all');
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ clientSecret: r.clientSecret, sessionId: r.sessionId });
  } catch (err) {
    console.error('[pay-setup/checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
