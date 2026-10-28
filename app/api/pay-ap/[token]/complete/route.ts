import { NextRequest, NextResponse } from 'next/server';
import { verifyPaymentSetupToken } from '@/lib/payment-setup-token';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { recordPaymentMethod } from '@/lib/server/agreement-payment-method';
import { markApPaid } from '@/lib/server/ap-requests';
import { getSql } from '@/lib/db';
import { recordNewPartnerEvent } from '@/lib/new-partner-v2/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const v = verifyPaymentSetupToken(token);
  if (!v.ok || v.subject.kind !== 'agreement' || !isStripeConfigured()) return NextResponse.json({ error: 'invalid link' }, { status: 401 });
  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  const cs = sessionId ? await getStripe().checkout.sessions.retrieve(sessionId).catch(() => null) : null;
  if (!cs || cs.metadata?.agreement_id !== v.subject.id || cs.metadata?.ap !== '1' || cs.status !== 'complete') {
    return NextResponse.json({ error: 'We could not confirm the payment.' }, { status: 400 });
  }
  await markApPaid(v.subject.id, cs.id);
  await recordPaymentMethod(v.subject.id, cs.id);
  await recordNewPartnerEvent(getSql(), v.subject.id, 'ap_payment_added', 'Accounts payable added payment details.');
  return NextResponse.json({ ok: true });
}
