import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { isStripeConfigured } from '@/lib/stripe';
import { createAgreementCheckout } from '@/lib/server/agreement-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
  const { token } = await ctx.params;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok || v.subject.kind !== 'agreement') return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  try {
    const r = await createAgreementCheckout({
      agreementId: v.subject.id,
      method: 'bank',
      returnUrl: `${req.nextUrl.origin}/pay/ap/${encodeURIComponent(token)}`,
      extraMetadata: { ap: '1' },
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ clientSecret: r.clientSecret, sessionId: r.sessionId });
  } catch (err) {
    console.error('[pay-ap/checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
