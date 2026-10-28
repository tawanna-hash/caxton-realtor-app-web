import type Stripe from 'stripe';
import { getSql } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };

/** Copies the payment method the partner actually used (card brand, debit or credit, last 4) onto the agreement. */
export async function recordPaymentMethod(agreementId: string, sessionId: string): Promise<void> {
  try {
    const cs = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['payment_intent.payment_method'] });
    const pi = cs.payment_intent as Stripe.PaymentIntent | null;
    const pm = pi && typeof pi !== 'string' ? (pi.payment_method as Stripe.PaymentMethod | null) : null;
    if (!pm || typeof pm === 'string') return;
    const sql = getSql();
    const name = pm.billing_details?.name ?? null;
    if (pm.type === 'card' && pm.card) {
      const kind = pm.card.funding === 'debit' ? 'Debit Card' : pm.card.funding === 'prepaid' ? 'Prepaid Card' : 'Credit Card';
      const brand = BRANDS[pm.card.brand] ?? pm.card.brand;
      const exp = `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`;
      await sql`UPDATE agreements SET payment_mode = 'card', card_type = ${`${kind} (${brand})`}, card_number_last4 = ${pm.card.last4},
        card_expiration = ${exp}, cardholder_name = COALESCE(${name}, cardholder_name), stripe_payment_method_id = ${pm.id} WHERE id = ${agreementId}`;
    } else if (pm.type === 'us_bank_account' && pm.us_bank_account) {
      await sql`UPDATE agreements SET payment_mode = 'ach', card_type = ${`Bank Account (ACH) - ${pm.us_bank_account.bank_name ?? 'US bank'}`},
        card_number_last4 = ${pm.us_bank_account.last4}, cardholder_name = COALESCE(${name}, cardholder_name), stripe_payment_method_id = ${pm.id} WHERE id = ${agreementId}`;
    }
  } catch (e) {
    console.warn('[recordPaymentMethod]', e instanceof Error ? e.message : String(e));
  }
}
