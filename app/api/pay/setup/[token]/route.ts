// POST /api/pay/setup/[token] — public. Verifies the signed setup token, then
// creates a Stripe Checkout Session in setup mode (card only,
// no charge) for the client's Stripe customer and redirects to it.
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { loadSetupTarget, ensureStripeCustomer, setupMetadata } from '@/lib/server/payment-setup';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  const back = (q: string) => NextResponse.redirect(new URL(`/pay/setup/${token}?${q}`, req.nextUrl.origin), 303);
  const v = verifyPaymentSetupToken(token);
  if (!v.ok) return back(`error=${v.reason}`);
  if (!isStripeConfigured()) return back('error=unavailable');
  try {
    const t = await loadSetupTarget(v.subject);
    if (!t) return back('error=invalid');
    const brand = t.brand;
    const stripe = getStripe();
    const customer = await ensureStripeCustomer(stripe, t);
    const meta = setupMetadata(t);
    const base = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer,
      currency: 'usd',
      // Card only. Bank accounts are added on our own page (see ./bank) because
      // Stripe's hosted bank connection asks returning Link users to sign in.
      payment_method_types: ['card'],
      setup_intent_data: {
        description: `${t.company ?? 'Client'} — payment method on file (${brand.brand})`,
        metadata: meta,
      },
      metadata: meta,
      custom_text: {
        submit: { message: `By saving, you authorize ${brand.brand} to charge this payment method for your advertising payments, according to the amounts and billing schedule you agreed to. Contact ${brand.billing_contact_email} to change or revoke this authorization.` },
      },
      success_url: `${base}/pay/setup/${token}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/pay/setup/${token}?canceled=1`,
    });
    if (!session.url) return back('error=unavailable');
    return NextResponse.redirect(session.url, 303);
  } catch (e) {
    console.error('[pay/setup] checkout session failed', e);
    return back('error=unavailable');
  }
}
