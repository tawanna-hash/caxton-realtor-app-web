import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { getPlatinumAccess } from '@/lib/server/platinum-store';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  const priceId = process.env.STRIPE_RNN_PLATINUM_PRICE_ID?.trim();
  if (!isStripeConfigured() || !priceId) {
    return NextResponse.json(
      { error: 'Online Platinum enrollment is not configured yet. Please contact Realty News Now.' },
      { status: 503 },
    );
  }

  const access = await getPlatinumAccess(user.realtorId);
  if (access.active) {
    return NextResponse.json({ url: new URL('/testimonial-hub', req.nextUrl.origin).toString() });
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: access.stripe_customer_id ?? undefined,
    customer_email: access.stripe_customer_id ? undefined : user.email,
    client_reference_id: user.realtorId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: new URL('/testimonial-hub?platinum=success', req.nextUrl.origin).toString(),
    cancel_url: new URL('/rnn-platinum?platinum=canceled', req.nextUrl.origin).toString(),
    metadata: {
      source: 'rnn_platinum',
      realtor_id: user.realtorId,
    },
    subscription_data: {
      metadata: {
        source: 'rnn_platinum',
        realtor_id: user.realtorId,
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
