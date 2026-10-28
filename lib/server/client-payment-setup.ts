// Client-level "update / add payment method" link. Uses Stripe Embedded Checkout in setup mode,
// so no charge is made. The saved method becomes the customer's default and is mirrored onto
// the client's most recent signed agreement so billing screens show it.
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

const BRANDS: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };

type Adv = { id: number; name: string | null; contact_email: string | null; billing_email: string | null; stripe_customer_id: string | null };

async function getAdvertiser(id: number): Promise<Adv | null> {
  await ensureSchema();
  const rows = (await getSql()`SELECT id, name, contact_email, billing_email, stripe_customer_id FROM advertisers WHERE id = ${id}`) as unknown as Adv[];
  return rows[0] ?? null;
}

export async function createClientSetupCheckout(advertiserId: number, method: 'all' | 'card' | 'bank' = 'all') {
  const adv = await getAdvertiser(advertiserId);
  if (!adv) return { ok: false as const, status: 404, error: 'not found' };
  const stripe = getStripe();
  let customer = adv.stripe_customer_id;
  if (customer) {
    const c = await stripe.customers.retrieve(customer).catch(() => null);
    if (!c || (c as Stripe.DeletedCustomer).deleted) customer = null;
  }
  if (!customer) {
    const c = await stripe.customers.create({ name: adv.name ?? undefined, email: adv.billing_email ?? adv.contact_email ?? undefined, metadata: { advertiser_id: String(adv.id) } });
    customer = c.id;
    await getSql()`UPDATE advertisers SET stripe_customer_id = ${customer} WHERE id = ${adv.id}`;
  }
  const session = await stripe.checkout.sessions.create({
    ui_mode: 'embedded_page',
    mode: 'setup',
    currency: 'usd',
    redirect_on_completion: 'never',
    customer,
    // One link, every option: cards (Apple Pay and Google Pay appear under card on supported devices),
    // bank account (ACH) and Link. The client picks.
    payment_method_types: method === 'bank' ? ['us_bank_account'] : method === 'card' ? ['card'] : ['card', 'us_bank_account', 'link'],
    metadata: { advertiser_id: String(adv.id), kind: 'pm_setup', method },
  } as never);
  return { ok: true as const, clientSecret: String(session.client_secret), sessionId: session.id };
}

export async function completeClientSetup(advertiserId: number, sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const stripe = getStripe();
  const cs = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent.payment_method'] }).catch(() => null);
  if (!cs || cs.metadata?.kind !== 'pm_setup' || cs.metadata?.advertiser_id !== String(advertiserId) || cs.status !== 'complete') return { ok: false, error: 'We could not confirm the payment method.' };
  const si = cs.setup_intent as Stripe.SetupIntent | null;
  const pm = si && typeof si !== 'string' ? (si.payment_method as Stripe.PaymentMethod | null) : null;
  if (!pm || typeof pm === 'string') return { ok: false, error: 'No payment method found.' };
  const customer = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id;
  if (customer) await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm.id } }).catch(() => null);
  const sql = getSql();
  let mode = 'card'; let label = 'Credit Card'; let last4 = ''; let exp: string | null = null;
  const custId: string | null = typeof cs.customer === 'string' ? cs.customer : cs.customer?.id ?? null;
  if (pm.type === 'card' && pm.card) {
    label = `${pm.card.funding === 'debit' ? 'Debit Card' : pm.card.funding === 'prepaid' ? 'Prepaid Card' : 'Credit Card'} (${BRANDS[pm.card.brand] ?? pm.card.brand})`;
    last4 = pm.card.last4; exp = `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}`;
  } else if (pm.type === 'us_bank_account' && pm.us_bank_account) {
    mode = 'ach'; label = `Bank Account (ACH) - ${pm.us_bank_account.bank_name ?? 'US bank'}`; last4 = pm.us_bank_account.last4 ?? '';
  }
  else if (pm.type === 'link') { mode = 'link'; label = 'Link'; last4 = ''; }
  const name = pm.billing_details?.name ?? null;
  await sql`UPDATE advertisers SET payment_mode = ${mode}, card_last4 = ${last4}, stripe_customer_id = COALESCE(${custId}::text, stripe_customer_id) WHERE id = ${advertiserId}`;
  const ag = (await sql`SELECT id FROM agreements WHERE advertiser_id = ${advertiserId} AND signed_at IS NOT NULL ORDER BY signed_at DESC LIMIT 1`) as unknown as Array<{ id: string }>;
  if (ag[0]) {
    await sql`UPDATE agreements SET payment_mode = ${mode}, card_type = ${label}, card_number_last4 = ${last4}, card_expiration = ${exp},
      cardholder_name = COALESCE(${name}, cardholder_name), stripe_payment_method_id = ${pm.id}, stripe_customer_id = COALESCE(${custId}::text, stripe_customer_id) WHERE id = ${ag[0].id}`;
  }
  return { ok: true };
}
