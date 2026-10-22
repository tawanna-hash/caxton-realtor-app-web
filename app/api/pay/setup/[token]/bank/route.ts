// POST /api/pay/setup/[token]/bank — public. Verifies the signed setup token and
// creates a SetupIntent for a US bank account entered by routing/account number
// on our page (verified by microdeposits). This avoids Stripe's hosted bank
// connection, which asks clients with a Stripe Link account to sign in.
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { loadSetupTarget, ensureStripeCustomer, setupMetadata } from '@/lib/server/payment-setup';
import { getStripe, getPublishableKey, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok) return NextResponse.json({ error: v.reason === 'expired' ? 'This link has expired.' : 'This link is not valid.' }, { status: 401 });
  const publishableKey = getPublishableKey();
  if (!isStripeConfigured() || !publishableKey) return NextResponse.json({ error: 'Secure setup is temporarily unavailable.' }, { status: 503 });
  try {
    const t = await loadSetupTarget(v.subject);
    if (!t) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
    const stripe = getStripe();
    const customer = await ensureStripeCustomer(stripe, t);
    const meta = setupMetadata(t);
    const si = await stripe.setupIntents.create({
      customer,
      usage: 'off_session',
      payment_method_types: ['us_bank_account'],
      payment_method_options: { us_bank_account: { verification_method: 'microdeposits' } },
      description: `${t.company ?? 'Client'} — bank account on file (${t.brand.brand})`,
      metadata: meta,
    });
    return NextResponse.json({ clientSecret: si.client_secret, publishableKey, email: t.email, company: t.company });
  } catch (e) {
    console.error('[pay/setup/bank] setup intent failed', e);
    return NextResponse.json({ error: 'Secure setup is temporarily unavailable. Please try again in a few minutes.' }, { status: 500 });
  }
}
