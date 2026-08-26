import { NextRequest, NextResponse } from 'next/server';
import { requirePlatinumUser } from '@/lib/server/auth/platinum';
import { getStripe, isStripeConfigured } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await requirePlatinumUser();
  if (!isStripeConfigured() || !user.platinum.stripe_customer_id) {
    return NextResponse.json(
      { error: 'This Platinum membership is managed by Realty News Now.' },
      { status: 400 },
    );
  }
  const session = await getStripe().billingPortal.sessions.create({
    customer: user.platinum.stripe_customer_id,
    return_url: new URL('/rnn-platinum', req.nextUrl.origin).toString(),
  });
  return NextResponse.json({ url: session.url });
}
