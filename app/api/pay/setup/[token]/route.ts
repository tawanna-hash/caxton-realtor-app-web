// POST /api/pay/setup/[token] — public. Verifies the signed setup token, then
// creates a Stripe Checkout Session in setup mode (card or US bank account,
// no charge) for the agreement's Stripe customer and redirects to it.
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { loadSetupAgreement, marketForAgreement, ensureStripeCustomer } from '@/lib/server/payment-setup';
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
    const ag = await loadSetupAgreement(v.agreementId);
    if (!ag || ag.status === 'cancelled') return back('error=invalid');
    const brand = marketForAgreement(ag);
    const stripe = getStripe();
    const customer = await ensureStripeCustomer(stripe, ag, brand);
    const base = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer,
      currency: 'usd',
      payment_method_types: ['card', 'us_bank_account'],
      payment_method_options: {
        us_bank_account: { financial_connections: { permissions: ['payment_method'] }, verification_method: 'automatic' },
      },
      setup_intent_data: {
        description: `${ag.company_name ?? 'Advertiser'} — payment method on file (${brand.brand})`,
        metadata: { agreement_id: ag.id, source: 'client_payment_setup', publication: brand.brand },
      },
      metadata: { agreement_id: ag.id, source: 'client_payment_setup', publication: brand.brand },
      custom_text: {
        submit: { message: `By saving, you authorize ${brand.brand} to charge this payment method for payments under your advertising agreement, according to its amounts and billing schedule. Contact ${brand.billing_contact_email} to change or revoke this authorization.` },
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
