// app/api/agree-v2/[token]/bank-intent/route.ts
//
// POST: PaymentIntent for paying a new-partner agreement by bank (ACH debit)
// at signing. Separate from the live card endpoint, which is left untouched.
// The partner pays the existing ACH processing fee (0.8%, capped at $5.00).
// Nothing is stored on the agreement here; the sign step verifies the intent.

import { loadPaymentSettings } from '@/lib/server/payment-settings';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { getStripe, getPublishableKey, isStripeConfigured } from '@/lib/stripe';
import { processingFeeCents } from '@/lib/payment-processing-fees';
import { getAgreementMeta } from '@/lib/agreements-v2/builder';
import { chargeBaseCents } from '@/lib/new-partner-v2/service';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = Agreement & { lines_total?: number; pay_now_total?: number };

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  await loadPaymentSettings();
  if (!isStripeConfigured()) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  const publishableKey = getPublishableKey();
  if (!publishableKey) return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
  const { token } = await ctx.params;
  const v = verifyToken(token);
  if (!v) return NextResponse.json({ error: 'invalid token' }, { status: 401 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT ag.*,
        (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS lines_total,
        (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id AND li.pay_now = true) AS pay_now_total
        FROM agreements ag WHERE ag.id = ${v.agreementId}
    `) as unknown as Row[];
    const ag = rows[0];
    if (!ag || ag.is_renewal) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (ag.signed_at) return NextResponse.json({ error: 'This agreement is already signed.' }, { status: 409 });
    const meta = await getAgreementMeta(ag.id, sql);
    if (meta?.payment?.bank_now !== true) return NextResponse.json({ error: 'Bank payment is not available for this agreement.' }, { status: 400 });
    if ((meta.options?.length ?? 0) > 1) return NextResponse.json({ error: 'Please choose a package first.' }, { status: 400 });
    const base = chargeBaseCents(ag);
    if (!base || base <= 0) return NextResponse.json({ error: 'Nothing is due now on this agreement.' }, { status: 400 });

    const fee = processingFeeCents(base, 'ach');
    const total = base + fee;
    const email = ag.advertiser_email ?? ag.billing_email ?? undefined;
    const pi = await getStripe().paymentIntents.create(
      {
        amount: total,
        currency: 'usd',
        payment_method_types: ['us_bank_account'],
        payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method'] }, verification_method: 'automatic' } },
        description: `${ag.company_name ?? 'Partner'} \u2014 new partner agreement (bank payment)`,
        receipt_email: email,
        metadata: {
          agreement_id: ag.id,
          base_amount_cents: String(base),
          surcharge_cents: String(fee),
          payment_kind: 'bank_now',
        },
      },
      // Same agreement and amount within 24 hours returns the same intent.
      { idempotencyKey: `agree-v2-bank-${ag.id}-${total}` },
    );
    if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(pi.status)) {
      return NextResponse.json({ error: 'A bank payment for this agreement is already in progress or complete.' }, { status: 409 });
    }
    return NextResponse.json({ clientSecret: pi.client_secret, publishableKey, paymentIntentId: pi.id, amountCents: total, baseCents: base, surchargeCents: fee });
  } catch (err) {
    return NextResponse.json({ error: 'Could not start the bank payment.', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
