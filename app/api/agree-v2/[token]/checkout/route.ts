// POST — create an Embedded Checkout session for the agreement's first payment.
// Body: { method: 'card' | 'link' | 'bank' }. Public; the HMAC token is the auth.
import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { chargeBaseCents } from '@/lib/new-partner-v2/service';
import { processingFeeCents } from '@/lib/payment-processing-fees';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Online payments are not available right now.' }, { status: 503 });
  const { token } = await ctx.params;
  const v = verifyToken(token);
  if (!v) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { method?: string };
  const method = body.method === 'bank' ? 'bank' : 'card';
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`SELECT * FROM agreements WHERE id = ${v.agreementId}`) as unknown as Agreement[];
    const ag = rows[0];
    if (!ag) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (ag.signed_at) return NextResponse.json({ error: 'This agreement is already signed.' }, { status: 409 });
    const base = chargeBaseCents(ag);
    if (!base || base <= 0) return NextResponse.json({ error: 'The amount due is missing on this agreement.' }, { status: 400 });
    const fee = processingFeeCents(base, method === 'bank' ? 'ach' : 'card');
    const name = ag.company_name ?? 'Partner';
    const origin = req.nextUrl.origin;
    const session = await getStripe().checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      redirect_on_completion: 'never',
      payment_method_types: method === 'bank' ? ['us_bank_account'] : ['card'],
      customer_creation: 'always',
      customer_email: ag.advertiser_email ?? ag.billing_email ?? undefined,
      line_items: [
        { quantity: 1, price_data: { currency: 'usd', unit_amount: base, product_data: { name: `${name} - advertising agreement` } } },
        ...(fee > 0 ? [{ quantity: 1, price_data: { currency: 'usd', unit_amount: fee, product_data: { name: method === 'bank' ? 'Bank payment fee (1%, $5 max)' : 'Card processing fee (3%)' } } }] : []),
      ],
      payment_intent_data: {
        setup_future_usage: 'off_session',
        description: `${name} - agreement ${ag.id}`,
        metadata: { agreement_id: ag.id, base_cents: String(base), fee_cents: String(fee), method },
      },
      metadata: { agreement_id: ag.id, method },
      return_url: `${origin}/agree/${encodeURIComponent(token)}`,
    } as never);
    return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id, totalCents: base + fee });
  } catch (err) {
    console.error('[agree-v2/checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
  }
}
