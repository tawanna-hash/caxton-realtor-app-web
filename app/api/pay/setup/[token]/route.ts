// /api/pay/setup/[token] — public. Verifies the signed setup token, then
// creates a Stripe Checkout Session in setup mode (no charge) for the client's
// Stripe customer and redirects straight to it. Stripe's page offers card,
// Apple Pay / Link and bank account (ACH) in one step.
//
// GET  — used by the email button, so the client lands on Stripe in one click.
// POST — same behaviour, used by the "try again" button on the fallback page.
import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { loadSetupTarget, createSetupCheckoutSession } from '@/lib/server/payment-setup';
import { isStripeConfigured } from '@/lib/stripe';
import { rateLimited, clientIp } from '@/lib/server/simple-rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

async function start(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;
  // `info=1` shows the page instead of redirecting (used by "Back" links).
  const back = (q: string) => NextResponse.redirect(new URL(`/pay/setup/${token}?${q}`, req.nextUrl.origin), 303);
  if (rateLimited(`pay-setup:${clientIp(req)}`, 15, 10 * 60 * 1000)) return back('error=busy');
  const v = verifyPaymentSetupToken(token);
  if (!v.ok) return back(`error=${v.reason}`);
  if (!isStripeConfigured()) return back('error=unavailable');
  try {
    const t = await loadSetupTarget(v.subject);
    if (!t) return back('error=invalid');
    const base = req.nextUrl.origin;
    const url = await createSetupCheckoutSession(t, {
      methods: ['card', 'us_bank_account'],
      successUrl: `${base}/pay/setup/${token}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/pay/setup/${token}?canceled=1`,
    });
    if (!url) return back('error=unavailable');
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error('[pay/setup] checkout session failed', e);
    return back('error=unavailable');
  }
}

export const GET = start;
export const POST = start;
