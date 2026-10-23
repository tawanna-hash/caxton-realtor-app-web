// Server helpers for the client Payment Method Setup flow (Stripe Checkout,
// mode: 'setup'). Saves a card or US bank account for a CLIENT (advertiser).
// When the client has a current agreement, the method is also saved on that
// agreement so existing agreement charging keeps working. Clients without an
// agreement keep it on the client record (advertisers.stripe_payment_method_id),
// which invoice auto-charge falls back to.
import type Stripe from 'stripe';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import { brandForMarket, type MarketBrand } from '@/lib/agreements-v2/payment-method-template';
import type { PaymentSetupSubject } from '@/lib/payment-setup-token';

type AdvRow = {
  id: number;
  name: string | null;
  company: string | null;
  first_name: string | null;
  contact_email: string | null;
  billing_email: string | null;
  phone: string | null;
  publication: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  current_agreement_id: string | null;
};

export type SetupTarget = {
  advertiser: AdvRow | null;
  agreement: Agreement | null;
  brand: MarketBrand;
  company: string | null;
  firstName: string | null;
  email: string | null;
};

let schemaReady = false;
export async function ensurePaymentSetupSchema() {
  if (schemaReady) return;
  await ensureSchema();
  const sql = getSql();
  await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS stripe_payment_method_id text`;
  await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS payment_method_label text`;
  await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS payment_method_saved_at timestamptz`;
  await sql`ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS payment_method_expiration text`;
  // Client file history: each sent setup request (with a copy of the email)
  // and each setup outcome from the client.
  await sql`
    CREATE TABLE IF NOT EXISTS client_payment_setup_log (
      id bigserial PRIMARY KEY,
      advertiser_id integer NOT NULL,
      event text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      actor text,
      market text,
      from_email text,
      to_emails text[],
      cc_emails text[],
      subject text,
      html text,
      setup_url text,
      link_expires_at timestamptz,
      agreement_id text,
      method_label text,
      method_last4 text,
      details text,
      stripe_ref text
    )`;
  await sql`CREATE INDEX IF NOT EXISTS client_payment_setup_log_adv_idx ON client_payment_setup_log (advertiser_id, created_at DESC)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS client_payment_setup_log_ref_uq ON client_payment_setup_log (event, stripe_ref) WHERE stripe_ref IS NOT NULL`;
  schemaReady = true;
}

export type SetupLogEvent = 'request_sent' | 'method_saved' | 'bank_pending' | 'setup_failed';
export type SetupLogInput = {
  advertiserId: number;
  event: SetupLogEvent;
  actor?: string | null;
  market?: string | null;
  fromEmail?: string | null;
  to?: string[] | null;
  cc?: string[] | null;
  subject?: string | null;
  html?: string | null;
  setupUrl?: string | null;
  linkExpiresAt?: Date | null;
  agreementId?: string | null;
  methodLabel?: string | null;
  methodLast4?: string | null;
  details?: string | null;
  stripeRef?: string | null;
};

/** Add an entry to the client's payment setup history. Best effort; never throws. */
export async function logClientSetup(e: SetupLogInput): Promise<void> {
  try {
    await ensurePaymentSetupSchema();
    await getSql()`
      INSERT INTO client_payment_setup_log
        (advertiser_id, event, actor, market, from_email, to_emails, cc_emails, subject, html, setup_url,
         link_expires_at, agreement_id, method_label, method_last4, details, stripe_ref)
      VALUES (${e.advertiserId}, ${e.event}, ${e.actor ?? null}, ${e.market ?? null}, ${e.fromEmail ?? null},
              ${e.to ?? null}, ${e.cc ?? null}, ${e.subject ?? null}, ${e.html ?? null}, ${e.setupUrl ?? null},
              ${e.linkExpiresAt ? e.linkExpiresAt.toISOString() : null}, ${e.agreementId ?? null}, ${e.methodLabel ?? null},
              ${e.methodLast4 ?? null}, ${e.details ?? null}, ${e.stripeRef ?? null})
      ON CONFLICT DO NOTHING`;
  } catch (err) {
    console.warn('[payment-setup] history log failed', err);
  }
}

function logOutcome(t: SetupTarget, event: SetupLogEvent, siId: string, extra: { label?: string | null; last4?: string | null; details?: string | null }) {
  if (!t.advertiser) return Promise.resolve();
  return logClientSetup({
    advertiserId: t.advertiser.id, event, actor: t.email ?? 'client', market: t.brand.market,
    agreementId: t.agreement?.id ?? null, methodLabel: extra.label ?? null, methodLast4: extra.last4 ?? null,
    details: extra.details ?? null, stripeRef: siId,
  });
}

/** Like logOutcome but reports whether this was the first time we saw this SetupIntent. */
async function logOutcomeOnce(t: SetupTarget, event: SetupLogEvent, siId: string, extra: { label?: string | null; last4?: string | null; details?: string | null }): Promise<boolean> {
  if (!t.advertiser) return false;
  const seen = (await getSql()`SELECT 1 FROM client_payment_setup_log WHERE event = ${event} AND stripe_ref = ${siId} LIMIT 1`) as unknown[];
  await logOutcome(t, event, siId, extra);
  return seen.length === 0;
}

function marketFromPublication(agPub: string | null | undefined, advPub: string | null | undefined): MarketBrand {
  if (agPub === 'san_antonio' || agPub === 'austin') return brandForMarket(agPub);
  const first = (advPub ?? '').split(',')[0]?.trim();
  return brandForMarket(first || 'austin');
}

async function loadAdvertiser(id: number): Promise<AdvRow | null> {
  const rows = (await getSql()`
    SELECT id, name, company, first_name, contact_email, billing_email, phone, publication, status,
           stripe_customer_id, stripe_payment_method_id, current_agreement_id::text AS current_agreement_id
      FROM advertisers WHERE id = ${id}`) as unknown as AdvRow[];
  return rows[0] ?? null;
}

async function loadAgreement(id: string): Promise<Agreement | null> {
  const rows = (await getSql()`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
  return rows[0] ?? null;
}

/** Resolve a token subject to the client (+ its current agreement, if any). */
export async function loadSetupTarget(subject: PaymentSetupSubject): Promise<SetupTarget | null> {
  await ensurePaymentSetupSchema();
  let advertiser: AdvRow | null = null;
  let agreement: Agreement | null = null;
  if (subject.kind === 'agreement') {
    agreement = await loadAgreement(subject.id);
    if (!agreement || agreement.status === 'cancelled') return null;
    if (agreement.advertiser_id) advertiser = await loadAdvertiser(agreement.advertiser_id);
  } else {
    advertiser = await loadAdvertiser(subject.id);
    if (!advertiser) return null;
    if (advertiser.current_agreement_id) {
      const a = await loadAgreement(advertiser.current_agreement_id);
      if (a && a.status !== 'cancelled') agreement = a;
    }
  }
  const brand = marketFromPublication(agreement?.publication, advertiser?.publication);
  const rep = agreement?.rep_name ?? advertiser?.name ?? null;
  return {
    advertiser,
    agreement,
    brand,
    company: agreement?.company_name ?? advertiser?.company ?? advertiser?.name ?? null,
    firstName: advertiser?.first_name?.trim() || (rep ?? '').trim().split(/\s+/)[0] || null,
    email: agreement?.billing_email ?? agreement?.advertiser_email ?? advertiser?.billing_email ?? advertiser?.contact_email ?? null,
  };
}

export async function ensureStripeCustomer(stripe: Stripe, t: SetupTarget): Promise<string> {
  let customerId = t.agreement?.stripe_customer_id ?? t.advertiser?.stripe_customer_id ?? null;
  if (customerId) {
    try {
      const c = await stripe.customers.retrieve(customerId);
      if (c.deleted) customerId = null;
    } catch { customerId = null; }
  }
  if (!customerId && (t.advertiser || t.agreement)) {
    // Match by our own ids only. Email is unsafe: a shared billing inbox would
    // attach one client's card or bank account to another client.
    try {
      const q = t.advertiser ? `metadata['advertiser_id']:'${t.advertiser.id}'` : `metadata['agreement_id']:'${t.agreement!.id}'`;
      const found = await stripe.customers.search({ query: q, limit: 1 });
      if (found.data[0] && !found.data[0].deleted) customerId = found.data[0].id;
    } catch (e) {
      console.warn('[payment-setup] customer search failed', e);
    }
  }
  if (!customerId) {
    const email = t.email ?? undefined;
    if (!customerId) {
      const created = await stripe.customers.create({
        email,
        name: t.company ?? undefined,
        phone: t.agreement?.advertiser_phone ?? t.advertiser?.phone ?? undefined,
        metadata: { advertiser_id: t.advertiser ? String(t.advertiser.id) : '', agreement_id: t.agreement?.id ?? '', publication: t.brand.brand },
      });
      customerId = created.id;
    }
  }
  const sql = getSql();
  if (t.agreement && t.agreement.stripe_customer_id !== customerId) await sql`UPDATE agreements SET stripe_customer_id = ${customerId}, updated_at = NOW() WHERE id = ${t.agreement.id}`;
  if (t.advertiser && t.advertiser.stripe_customer_id !== customerId) await sql`UPDATE advertisers SET stripe_customer_id = ${customerId}, updated_at = NOW() WHERE id = ${t.advertiser.id}`;
  return customerId;
}

/** Metadata stamped on the Checkout Session + SetupIntent so the webhook can find the client. */
export function setupMetadata(t: SetupTarget): Record<string, string> {
  return {
    source: 'client_payment_setup',
    advertiser_id: t.advertiser ? String(t.advertiser.id) : '',
    agreement_id: t.agreement?.id ?? '',
    publication: t.brand.brand,
  };
}

function subjectFromMetadata(m: Stripe.Metadata | null | undefined): PaymentSetupSubject | null {
  if (!m || m.source !== 'client_payment_setup') return null;
  if (m.advertiser_id && /^\d+$/.test(m.advertiser_id)) return { kind: 'client', id: Number(m.advertiser_id) };
  if (m.agreement_id) return { kind: 'agreement', id: m.agreement_id };
  return null;
}

function belongs(t: SetupTarget, m: Stripe.Metadata | null | undefined): boolean {
  if (!m || m.source !== 'client_payment_setup') return false;
  if (t.advertiser && m.advertiser_id === String(t.advertiser.id)) return true;
  return !!t.agreement && m.agreement_id === t.agreement.id;
}

function prettyBrand(b: string | null | undefined): string | null {
  if (!b) return null;
  if (b === 'visa') return 'Visa';
  if (b === 'mastercard') return 'Mastercard';
  if (b === 'amex') return 'American Express';
  return b.charAt(0).toUpperCase() + b.slice(1);
}

export type SavedMethod = { kind: 'card' | 'bank'; label: string; last4: string | null; status: 'saved' | 'pending' };

/** Persist the payment method from a completed setup Checkout Session. Idempotent. */
export async function saveFromCheckoutSession(t: SetupTarget, sessionId: string): Promise<(SavedMethod & { verifyUrl?: string | null }) | { error: string }> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ['setup_intent', 'setup_intent.payment_method'] });
  if (session.mode !== 'setup' || !belongs(t, session.metadata)) return { error: 'This setup session does not belong to this client.' };
  const si = session.setup_intent as Stripe.SetupIntent | null;
  if (!si || typeof si === 'string') return { error: 'Setup is not complete yet.' };
  const already = (await getSql()`SELECT 1 FROM client_payment_setup_log WHERE event = 'bank_pending' AND stripe_ref = ${si.id} LIMIT 1`) as unknown[];
  const saved = await persistSetupIntent(t, si);
  if ('error' in saved) return saved;
  // Bank account that Stripe could not verify instantly: email the verify link once.
  const verifyUrl = si.next_action?.verify_with_microdeposits?.hosted_verification_url ?? null;
  if (saved.status === 'pending' && verifyUrl && already.length === 0) await emailMicrodepositLink(t, verifyUrl, saved.last4);
  return { ...saved, verifyUrl };
}

/**
 * Persist the payment method from a SetupIntent confirmed on our own bank form
 * (manual routing/account entry, no Stripe sign-in). Idempotent.
 */
export async function saveFromSetupIntentId(t: SetupTarget, setupIntentId: string): Promise<(SavedMethod & { verifyUrl?: string | null }) | { error: string }> {
  const si = await getStripe().setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });
  if (!belongs(t, si.metadata)) return { error: 'This setup does not belong to this client.' };
  const already = (await getSql()`SELECT 1 FROM client_payment_setup_log WHERE event = 'bank_pending' AND stripe_ref = ${si.id} LIMIT 1`) as unknown[];
  const saved = await persistSetupIntent(t, si);
  if ('error' in saved) return saved;
  const verifyUrl = si.next_action?.verify_with_microdeposits?.hosted_verification_url ?? null;
  // First time we see this pending bank: email the client their verification link.
  if (saved.status === 'pending' && verifyUrl && already.length === 0) await emailMicrodepositLink(t, verifyUrl, saved.last4);
  return { ...saved, verifyUrl };
}

/** Email the client their Stripe microdeposit verification link (no sign-in needed). Best effort. */
export async function emailMicrodepositLink(t: SetupTarget, verifyUrl: string, last4: string | null): Promise<void> {
  if (!t.email) return;
  try {
    const { sendEmail } = await import('@/lib/email');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const hi = t.firstName ? `Hi ${esc(t.firstName)},` : 'Hello,';
    await sendEmail({
      from: `Tawanna Verock <${t.brand.sender_email}>`,
      to: t.email,
      subject: `One last step to verify your bank account — ${t.brand.brand}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D;max-width:560px"><p>${hi}</p><p>Thank you for adding your bank account${last4 ? ` ending in ${esc(last4)}` : ''}. Within 1–2 business days you'll see a small deposit from Stripe, our payment processor, on your bank statement. Its description includes a 6-digit code that starts with <strong>SM</strong>.</p><p>When it arrives, use the button below to enter that code. No login or account is needed.</p><p><a href="${esc(verifyUrl)}" style="display:inline-block;background:#301D5D;color:#ffffff;font-weight:600;padding:14px 28px;border-radius:10px;text-decoration:none">Verify bank account</a></p><p style="font-size:13px;color:#4E4B66">You were not charged. Questions? Contact ${esc(t.brand.billing_contact_email)}.</p><p>Have a great day! ~ Tawanna<br/>${esc(t.brand.brand)}</p></div>`,
    });
  } catch (e) {
    console.warn('[payment-setup] microdeposit email failed', e);
  }
}

/** Write a client-setup SetupIntent's payment method onto the client (and its current agreement). */
export async function persistSetupIntent(t: SetupTarget, si: Stripe.SetupIntent): Promise<SavedMethod | { error: string }> {
  const pm = typeof si.payment_method === 'string' || !si.payment_method ? null : si.payment_method;
  if (!pm) return { error: si.status === 'requires_payment_method' ? 'No payment method was saved.' : 'Setup is not complete yet.' };
  if (si.status !== 'succeeded' && si.status !== 'processing' && si.status !== 'requires_action') return { error: 'No payment method was saved.' };
  const pending = si.status !== 'succeeded';

  const sql = getSql();
  const customerId = typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? null);
  const isBank = pm.type === 'us_bank_account' && !!pm.us_bank_account;
  const card = pm.card ?? null;
  const label = isBank ? `Bank account${pm.us_bank_account?.bank_name ? ` (${pm.us_bank_account.bank_name})` : ''}` : (prettyBrand(card?.brand) ?? 'Card');
  const last4 = isBank ? (pm.us_bank_account?.last4 ?? null) : (card?.last4 ?? null);
  const saved: SavedMethod = { kind: isBank ? 'bank' : 'card', label, last4, status: pending ? 'pending' : 'saved' };
  if (pending) {
    await auditAgreement(t, 'payment_method_pending', `Client payment setup page — ${label} ••••${last4 ?? '????'} (bank verification pending) — seti: ${si.id}`, si.id);
    await logOutcome(t, 'bank_pending', si.id, { label, last4, details: 'Bank verification pending' });
    // The client has acted; stop AP reminders while Stripe verifies (failures email billing).
    if (t.agreement) void import('@/lib/server/payment-setup-reminders').then((m) => m.resolveSetupRequest(t.agreement!.id, 'bank verification pending'));
    return saved;
  }

  const prevId = t.advertiser?.stripe_payment_method_id ?? t.agreement?.stripe_payment_method_id ?? null;
  const expText = !isBank && card?.exp_month && card?.exp_year ? `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}` : null;

  // Client record — always.
  if (t.advertiser) {
    await sql`
      UPDATE advertisers SET
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_payment_method_id = ${pm.id},
        payment_method_label = ${label},
        payment_method_saved_at = NOW(),
        payment_method_expiration = ${expText},
        card_last4 = ${last4},
        payment_mode = COALESCE(payment_mode, 'card'),
        updated_at = NOW()
      WHERE id = ${t.advertiser.id}`;
  }

  // Current agreement — when there is one.
  if (t.agreement) {
    const ag = t.agreement;
    if (isBank) {
      await sql`
        UPDATE agreements SET
          stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
          stripe_payment_method_id = ${pm.id},
          payment_mode = COALESCE(payment_mode, 'card'),
          card_type = ${label}, card_number_last4 = ${last4}, card_expiration = NULL,
          cardholder_name = COALESCE(${pm.billing_details?.name ?? null}, cardholder_name),
          updated_at = NOW()
        WHERE id = ${ag.id}`;
    } else {
      const exp = card?.exp_month && card?.exp_year ? `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}` : null;
      const addr = pm.billing_details?.address;
      const addrText = addr ? ([addr.line1, addr.line2, addr.city, addr.state, addr.postal_code].filter(Boolean).join(', ') || null) : null;
      await sql`
        UPDATE agreements SET
          stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
          stripe_payment_method_id = ${pm.id},
          payment_mode = COALESCE(payment_mode, 'card'),
          card_type = COALESCE(${label}, card_type),
          card_number_last4 = COALESCE(${last4}, card_number_last4),
          card_expiration = COALESCE(${exp}, card_expiration),
          cardholder_name = COALESCE(${pm.billing_details?.name ?? null}, cardholder_name),
          cardholder_address = COALESCE(${addrText}, cardholder_address),
          updated_at = NOW()
        WHERE id = ${ag.id}`;
    }
    await auditAgreement(t, 'card_on_file_saved', `Client payment setup page — ${label} ••••${last4 ?? '????'} — seti: ${si.id}`, si.id);
    const updated = await loadAgreement(ag.id);
    if (updated) { try { await syncAgreementToAdvertiser(updated); } catch (e) { console.warn('[payment-setup] advertiser sync failed', e); } }
  }
  if (t.agreement) void import('@/lib/server/payment-setup-reminders').then((m) => m.resolveSetupRequest(t.agreement!.id, 'payment method saved'));
  const firstSave = await logOutcomeOnce(t, 'method_saved', si.id, { label, last4, details: t.agreement ? 'Saved on the client and the current agreement' : 'Saved on the client' });
  if (firstSave) await notifyMethodSaved(t, label, last4, !!prevId && prevId !== pm.id);
  return saved;
}

async function auditAgreement(t: SetupTarget, event: string, details: string, siId: string) {
  if (!t.agreement) return;
  const sql = getSql();
  const rows = (await sql`SELECT audit_log FROM agreements WHERE id = ${t.agreement.id}`) as unknown as Array<{ audit_log: AgreementAuditEntry[] | null }>;
  const log = rows[0]?.audit_log ?? [];
  if (log.some((e) => e.event === event && typeof e.details === 'string' && e.details.includes(siId))) return;
  const next = appendAudit(log, { event, timestamp: new Date().toISOString(), user_email: t.email ?? 'client', details });
  await sql`UPDATE agreements SET audit_log = ${JSON.stringify(next)}::jsonb WHERE id = ${t.agreement.id}`;
}

/** Tell billing (and confirm to the client) that a payment method was saved or replaced. Best effort. */
async function notifyMethodSaved(t: SetupTarget, label: string, last4: string | null, replaced: boolean) {
  try {
    const { sendEmail } = await import('@/lib/email');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const who = t.company ?? 'A client';
    const what = `${label}${last4 ? ` ending in ${last4}` : ''}`;
    await sendEmail({
      from: `Tawanna Verock <${t.brand.sender_email}>`,
      to: t.brand.billing_contact_email,
      subject: `${replaced ? 'Payment method REPLACED' : 'Payment method saved'} — ${who} (${t.brand.brand})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D"><p><strong>${esc(who)}</strong> ${replaced ? 'replaced their payment method on file with' : 'saved'} ${esc(what)} from the payment setup page.</p>${replaced ? '<p style="color:#9B1C1C">If this was not expected, contact the client before the next charge.</p>' : ''}</div>`,
    });
    if (t.email && replaced) {
      await sendEmail({
        from: `Tawanna Verock <${t.brand.sender_email}>`,
        to: t.email,
        subject: `Your payment method was updated — ${t.brand.brand}`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D;max-width:560px"><p>${t.firstName ? `Hi ${esc(t.firstName)},` : 'Hello,'}</p><p>The payment method on file for your ${esc(t.brand.brand)} advertising account is now ${esc(what)}. You were not charged.</p><p>If you did not make this change, contact ${esc(t.brand.billing_contact_email)} right away.</p></div>`,
      });
    }
  } catch (e) {
    console.warn('[payment-setup] method saved notice failed', e);
  }
}

/** Notify the market's billing inbox about a bank verification outcome. Best effort. */
async function notifyBankOutcome(t: SetupTarget, ok: boolean, detail: string) {
  try {
    const { sendEmail } = await import('@/lib/email');
    const who = t.company ?? 'A client';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendEmail({
      from: `Tawanna Verock <${t.brand.sender_email}>`,
      to: t.brand.billing_contact_email,
      subject: `${ok ? 'Bank account verified' : 'Bank verification failed'} — ${who} (${t.brand.brand})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#16132D"><p><strong>${esc(who)}</strong> — ${ok ? 'the bank account from the payment setup page is verified and now on file.' : 'bank verification failed, so no bank account was saved. Send them a new setup link from Templates (Beta).'}</p><p style="color:#4E4B66">${esc(detail)}</p></div>`,
    });
  } catch (e) {
    console.warn('[payment-setup] bank outcome notify failed', e);
  }
}

/** Webhook: checkout.session.completed for a client setup session (client closed the tab). */
export async function handleClientSetupSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== 'setup') return;
  const subject = subjectFromMetadata(session.metadata);
  if (!subject) return;
  const t = await loadSetupTarget(subject);
  if (t) await saveFromCheckoutSession(t, session.id);
}

/**
 * Webhook: setup_intent.succeeded / setup_intent.setup_failed for SetupIntents
 * created by the client payment setup page. Bank accounts verified later (e.g.
 * micro-deposits) land here, so the client updates without returning to the page.
 */
export async function handleClientSetupIntentEvent(siEvent: Stripe.SetupIntent, outcome: 'succeeded' | 'failed'): Promise<void> {
  const subject = subjectFromMetadata(siEvent.metadata);
  if (!subject) return;
  const t = await loadSetupTarget(subject);
  if (!t) return;
  const si = await getStripe().setupIntents.retrieve(siEvent.id, { expand: ['payment_method'] });
  const pm = typeof si.payment_method === 'string' || !si.payment_method ? null : si.payment_method;
  const isBank = pm?.type === 'us_bank_account' || (!pm?.card && !!siEvent.payment_method_types?.includes('us_bank_account'));

  if (outcome === 'succeeded') {
    const before = t.advertiser?.stripe_payment_method_id ?? t.agreement?.stripe_payment_method_id ?? null;
    const saved = await persistSetupIntent(t, si);
    if (!('error' in saved) && saved.kind === 'bank' && before !== pm?.id) {
      await notifyBankOutcome(t, true, `${saved.label} ending in ${saved.last4 ?? '????'}`);
    }
    return;
  }

  const reason = si.last_setup_error?.message ?? siEvent.last_setup_error?.message ?? 'Verification did not complete.';
  await auditAgreement(t, 'payment_method_failed', `Client payment setup — ${isBank ? 'bank verification failed' : 'setup failed'}: ${reason} — seti: ${si.id}`, si.id);
  await logOutcome(t, 'setup_failed', si.id, { label: isBank ? 'Bank account' : 'Card', details: reason });
  if (isBank) await notifyBankOutcome(t, false, reason);
}


/** Create a Stripe Checkout Session in setup mode (no charge) for a client or agreement.
 *  `methods` picks what Stripe offers: card (incl. Apple Pay / Link), bank account, or both. */
export async function createSetupCheckoutSession(
  t: SetupTarget,
  opts: { successUrl: string; cancelUrl: string; methods: Array<'card' | 'us_bank_account'> },
): Promise<string | null> {
  const stripe = getStripe();
  const customer = await ensureStripeCustomer(stripe, t);
  const meta = setupMetadata(t);
  const brand = t.brand;
  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer,
    currency: 'usd',
    payment_method_types: opts.methods,
    ...(opts.methods.includes('us_bank_account')
      ? { payment_method_options: { us_bank_account: { financial_connections: { permissions: ['payment_method' as const] }, verification_method: 'automatic' as const } } }
      : {}),
    setup_intent_data: {
      description: `${t.company ?? 'Client'} \u2014 payment method on file (${brand.brand})`,
      metadata: meta,
    },
    metadata: meta,
    custom_text: {
      submit: { message: `By saving, you authorize ${brand.brand} to charge this payment method for your advertising payments, according to the amounts and billing schedule you agreed to. Contact ${brand.billing_contact_email} to change or revoke this authorization.` },
    },
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  });
  return session.url;
}
