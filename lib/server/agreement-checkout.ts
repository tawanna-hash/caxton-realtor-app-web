// Shared builder for the Embedded Checkout session used by the client agreement
// page and by the accounts-payable pay-only page.
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { chargeBaseCents } from '@/lib/new-partner-v2/service';
import { processingFeeCents } from '@/lib/payment-processing-fees';
import type { Agreement } from '@/lib/agreements';

export type CheckoutResult =
  | { ok: true; clientSecret: string; sessionId: string; totalCents: number }
  | { ok: false; status: number; error: string };

export async function createAgreementCheckout(opts: {
  agreementId: string;
  method: 'card' | 'bank';
  returnUrl: string;
  extraMetadata?: Record<string, string>;
}): Promise<CheckoutResult> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`SELECT * FROM agreements WHERE id = ${opts.agreementId}`) as unknown as Agreement[];
  const ag = rows[0];
  if (!ag) return { ok: false, status: 404, error: 'not found' };
  if (ag.signed_at && !opts.extraMetadata?.ap) return { ok: false, status: 409, error: 'This agreement is already signed.' };
  const base = chargeBaseCents(ag);
  if (!base || base <= 0) return { ok: false, status: 400, error: 'The amount due is missing on this agreement.' };
  const method = opts.method;
  const fee = processingFeeCents(base, method === 'bank' ? 'ach' : 'card');
  const name = ag.company_name ?? 'Partner';
  const meta = { agreement_id: ag.id, method, ...(opts.extraMetadata ?? {}) };
  const session = await getStripe().checkout.sessions.create({
    ui_mode: 'embedded_page',
    mode: 'payment',
    redirect_on_completion: 'never',
    allowed_payment_method_types: method === 'bank' ? ['us_bank_account'] : ['card'],
    customer_creation: 'always',
    customer_email: ag.advertiser_email ?? ag.billing_email ?? undefined,
    line_items: [
      { quantity: 1, price_data: { currency: 'usd', unit_amount: base, product_data: { name: `${name} - advertising agreement` } } },
      ...(fee > 0 ? [{ quantity: 1, price_data: { currency: 'usd', unit_amount: fee, product_data: { name: method === 'bank' ? 'Bank payment fee (1%, $5 max)' : 'Card processing fee (3%)' } } }] : []),
    ],
    payment_intent_data: {
      setup_future_usage: 'off_session',
      description: `${name} - agreement ${ag.id}`,
      metadata: { ...meta, base_cents: String(base), fee_cents: String(fee) },
    },
    metadata: meta,
    return_url: opts.returnUrl,
  } as never);
  return { ok: true, clientSecret: String(session.client_secret), sessionId: session.id, totalCents: base + fee };
}
