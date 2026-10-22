// Server helpers for the client Payment Method Setup flow (Stripe Checkout,
// mode: 'setup'). Saves a card or US bank account on the agreement so future
// charges follow the agreement's billing schedule.
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import { brandForMarket, type MarketBrand } from '@/lib/agreements-v2/payment-method-template';

export type SetupAgreement = Agreement & { advertiser_publication: string | null };

export async function loadSetupAgreement(id: string): Promise<SetupAgreement | null> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT a.*, adv.publication AS advertiser_publication
      FROM agreements a LEFT JOIN advertisers adv ON adv.id = a.advertiser_id
     WHERE a.id = ${id}`) as unknown as SetupAgreement[];
  return rows[0] ?? null;
}

/** Market for branding: the agreement's own publication, else the advertiser's first publication, else Austin. */
export function marketForAgreement(ag: Pick<SetupAgreement, 'publication' | 'advertiser_publication'>): MarketBrand {
  if (ag.publication === 'san_antonio' || ag.publication === 'austin') return brandForMarket(ag.publication);
  const first = (ag.advertiser_publication ?? '').split(',')[0]?.trim();
  return brandForMarket(first || 'austin');
}

export async function ensureStripeCustomer(stripe: Stripe, ag: SetupAgreement, brand: MarketBrand): Promise<string> {
  let customerId = ag.stripe_customer_id ?? null;
  if (customerId) {
    try {
      const c = await stripe.customers.retrieve(customerId);
      if (c.deleted) customerId = null;
    } catch { customerId = null; }
  }
  if (!customerId) {
    const email = ag.billing_email ?? ag.advertiser_email ?? undefined;
    if (email) {
      const found = await stripe.customers.list({ email, limit: 1 });
      if (found.data.length > 0) customerId = found.data[0].id;
    }
    if (!customerId) {
      const created = await stripe.customers.create({
        email,
        name: ag.company_name ?? ag.rep_name ?? undefined,
        phone: ag.advertiser_phone ?? undefined,
        metadata: { agreement_id: ag.id, publication: brand.brand },
      });
      customerId = created.id;
    }
    await getSql()`UPDATE agreements SET stripe_customer_id = ${customerId}, updated_at = NOW() WHERE id = ${ag.id}`;
  }
  return customerId;
}

function prettyBrand(b: string | null | undefined): string | null {
  if (!b) return null;
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard') return 'Mastercard';
  if (b === 'amex') return 'American Express';
  return b.charAt(0).toUpperCase() + b.slice(1);
}

export type SavedMethod = { kind: 'card' | 'bank'; label: string; last4: string | null; status: 'saved' | 'pending' };

/**
 * Persist the payment method from a completed setup Checkout Session. Idempotent:
 * re-loading the success page writes the same values again without duplicating audit entries.
 */
export async function saveFromCheckoutSession(ag: SetupAgreement, sessionId: string): Promise<SavedMethod | { error: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'setup_intent.payment_method'] });
  if (session.mode !== 'setup' || session.metadata?.agreement_id !== ag.id) return { error: 'This setup session does not belong to this agreement.' };
  const si = session.setup_intent as Stripe.SetupIntent | null;
  if (!si || typeof si === 'string') return { error: 'Setup is not complete yet.' };
  return persistSetupIntent(ag, si);
}

/** Write a client-setup SetupIntent's payment method onto the agreement (card, or bank once verified). */
export async function persistSetupIntent(ag: SetupAgreement, si: Stripe.SetupIntent): Promise<SavedMethod | { error: string }> {
  const pm = typeof si.payment_method === 'string' || !si.payment_method ? null : si.payment_method;
  if (!pm) return { error: si.status === 'requires_payment_method' ? 'No payment method was saved.' : 'Setup is not complete yet.' };

  const pending = si.status !== 'succeeded';
  if (si.status !== 'succeeded' && si.status !== 'processing' && si.status !== 'requires_action') return { error: 'No payment method was saved.' };

  const sql = getSql();
  const customerId = typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? ag.stripe_customer_id ?? null);
  let saved: SavedMethod;
  if (pm.type === 'us_bank_account' && pm.us_bank_account) {
    const bank = pm.us_bank_account;
    const label = `Bank account${bank.bank_name ? ` (${bank.bank_name})` : ''}`;
    saved = { kind: 'bank', label, last4: bank.last4 ?? null, status: pending ? 'pending' : 'saved' };
    if (!pending) {
      await sql`
        UPDATE agreements SET
          stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
          stripe_payment_method_id = ${pm.id},
          card_type = ${label}, card_number_last4 = ${bank.last4 ?? null}, card_expiration = NULL,
          cardholder_name = COALESCE(${pm.billing_details?.name ?? null}, cardholder_name),
          updated_at = NOW()
        WHERE id = ${ag.id}`;
    }
  } else {
    const card = pm.card ?? null;
    const brandName = prettyBrand(card?.brand);
    const exp = card?.exp_month && card?.exp_year ? `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}` : null;
    const addr = pm.billing_details?.address;
    const addrText = addr ? ([addr.line1, addr.line2, addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ') || null) : null;
    saved = { kind: 'card', label: brandName ?? 'Card', last4: card?.last4 ?? null, status: 'saved' };
    await sql`
      UPDATE agreements SET
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_payment_method_id = ${pm.id},
        payment_mode = COALESCE(payment_mode, 'card'),
        card_type = COALESCE(${brandName}, card_type),
        card_number_last4 = COALESCE(${card?.last4 ?? null}, card_number_last4),
        card_expiration = COALESCE(${exp}, card_expiration),
        cardholder_name = COALESCE(${pm.billing_details?.name ?? null}, cardholder_name),
        cardholder_address = COALESCE(${addrText}, cardholder_address),
        updated_at = NOW()
      WHERE id = ${ag.id}`;
  }

  const rows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
  const log = rows[0]?.audit_log ?? [];
  const eventName = pending ? 'payment_method_pending' : 'card_on_file_saved';
  if (!log.some((e) => e.event === eventName && typeof e.details === 'string' && e.details.includes(si.id))) {
    const next = appendAudit(log, {
      event: eventName,
      timestamp: new Date().toISOString(),
      user_email: ag.billing_email ?? ag.advertiser_email ?? 'client',
      details: `Client payment setup page — ${saved.label} ••••${saved.last4 ?? '????'}${pending ? ' (bank verification pending)' : ''} — seti: ${si.id}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(next)}::jsonb WHERE id = ${ag.id}`;
  }
  if (!pending) {
    const updated = (await sql`SELECT * FROM agreements WHERE id = ${ag.id}`) as unknown as Agreement[];
    if (updated[0]) { try { await syncAgreementToAdvertiser(updated[0]); } catch (e) { console.warn('[payment-setup] advertiser sync failed', e); } }
  }
  return saved;
}

/** Notify the market's billing inbox about a bank verification outcome. Best effort. */
async function notifyBankOutcome(ag: SetupAgreement, ok: boolean, detail: string) {
  try {
    const { sendEmail } = await import('@/lib/email');
    const brand = marketForAgreement(ag);
    const who = ag.company_name ?? ag.rep_name ?? 'An advertiser';
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendEmail({
      from: `Tawanna Verock <${brand.sender_email}>`,
      to: brand.billing_contact_email,
      subject: `${ok ? 'Bank account verified' : 'Bank verification failed'} — ${who} (${brand.brand})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D"><p><strong>${esc(who)}</strong> — ${ok ? 'the bank account from the payment setup page is verified and now on file for this agreement.' : 'bank verification failed, so no bank account was saved. Send them a new setup link from Templates (Beta).'}</p><p style="color:#4E4B66">${esc(detail)}</p><p style="color:#4E4B66">Agreement ${esc(ag.id)}</p></div>`,
    });
  } catch (e) {
    console.warn('[payment-setup] bank outcome notify failed', e);
  }
}

/**
 * Stripe webhook: setup_intent.succeeded / setup_intent.setup_failed for SetupIntents
 * created by the client payment setup page. Bank accounts verified later (e.g. micro-deposits)
 * land here, so the agreement updates without the client returning to the page.
 */
export async function handleClientSetupIntentEvent(siEvent: Stripe.SetupIntent, outcome: 'succeeded' | 'failed'): Promise<void> {
  if (siEvent.metadata?.source !== 'client_payment_setup' || !siEvent.metadata?.agreement_id) return;
  const ag = await loadSetupAgreement(siEvent.metadata.agreement_id);
  if (!ag) return;
  const si = await getStripe().setupIntents.retrieve(siEvent.id, { expand: ['payment_method'] });
  const pm = typeof si.payment_method === 'string' || !si.payment_method ? null : si.payment_method;
  const isBank = pm?.type === 'us_bank_account' || (!pm?.card && !!siEvent.payment_method_types?.includes('us_bank_account'));

  if (outcome === 'succeeded') {
    const before = ag.stripe_payment_method_id;
    const saved = await persistSetupIntent(ag, si);
    if (!('error' in saved) && saved.kind === 'bank' && before !== pm?.id) {
      await notifyBankOutcome(ag, true, `${saved.label} ending in ${saved.last4 ?? '????'}`);
    }
    return;
  }

  const reason = si.last_setup_error?.message ?? siEvent.last_setup_error?.message ?? 'Verification did not complete.';
  const sql = getSql();
  const rows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
  const log = rows[0]?.audit_log ?? [];
  if (log.some((e) => e.event === 'payment_method_failed' && typeof e.details === 'string' && e.details.includes(si.id))) return;
  const next = appendAudit(log, {
    event: 'payment_method_failed',
    timestamp: new Date().toISOString(),
    user_email: 'stripe',
    details: `Client payment setup — ${isBank ? 'bank verification failed' : 'setup failed'}: ${reason} — seti: ${si.id}`,
  });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(next)}::jsonb, updated_at = NOW() WHERE id = ${ag.id}`;
  if (isBank) await notifyBankOutcome(ag, false, reason);
}
