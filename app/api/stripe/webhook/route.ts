// Stripe webhook: records Embedded Checkout results on the agreement audit trail.
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, getWebhookSecret } from '@/lib/stripe';
import { markApPaid } from '@/lib/server/ap-requests';
import { amendAgreementWithPayment } from '@/lib/server/ap-amend';
import { recordPaymentMethod } from '@/lib/server/agreement-payment-method';
import { recordNewPartnerEvent } from '@/lib/new-partner-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = getWebhookSecret();
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) return NextResponse.json({ error: 'not configured' }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }
  const types: Record<string, string> = {
    'checkout.session.completed': 'paid or processing',
    'checkout.session.async_payment_succeeded': 'bank payment cleared',
    'checkout.session.async_payment_failed': 'bank payment FAILED',
  };
  if (types[event.type]) {
    const s = event.data.object as Stripe.Checkout.Session;
    const id = s.metadata?.agreement_id;
    if (id) {
      await ensureSchema();
      const sql = getSql();
      const amt = ((s.amount_total ?? 0) / 100).toFixed(2);
      await recordNewPartnerEvent(sql, id, 'stripe_checkout', `Stripe checkout: ${types[event.type]} ($${amt}, ${s.metadata?.method ?? 'card'}, session ${s.id}, payment status ${s.payment_status}).`);
      if (event.type !== 'checkout.session.async_payment_failed') await recordPaymentMethod(id, s.id);
      if (s.metadata?.ap === '1' && event.type !== 'checkout.session.async_payment_failed') { await markApPaid(id, s.id); await amendAgreementWithPayment(id, s.id); }
    }
  }
  return NextResponse.json({ received: true });
}
