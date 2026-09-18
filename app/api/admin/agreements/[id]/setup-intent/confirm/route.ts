// app/api/admin/agreements/[id]/setup-intent/confirm/route.ts
//
// POST — Persist the card a SetupIntent just saved onto the agreement.
// Auth: admin required.
//
// Body: { setupIntentId: string }
//
// Called by AddCardDrawer.tsx immediately after stripe.confirmSetup() resolves.
// We retrieve the SetupIntent server-side (expanding payment_method) so we can
// read brand / last4 / exp_month / exp_year and write the same column set the
// Stripe webhook writes for the sign-wizard flow:
//   stripe_customer_id, stripe_payment_method_id, card_type,
//   card_number_last4, card_expiration ("MM/YY"), cardholder_name,
//   cardholder_address, payment_mode
//
// Deliberately NOT webhook-driven: `setup_intent.succeeded` would arrive
// asynchronously (and would need a new event added to the Stripe Dashboard
// webhook config), which cannot back a synchronous "card added → auto-charge
// checkbox appears" UX. No Stripe Dashboard changes are required by this route.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { syncAgreementToAdvertiser } from '@/lib/server/billing-crm-sync';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETUP_INTENT_RE = /^seti_[A-Za-z0-9_]+$/;
type RouteCtx = { params: Promise<{ id: string }> };

/** Same brand prettifier the Stripe webhook uses, so card_type stays uniform. */
function prettyBrand(brand: string | null | undefined): string | null {
  if (!brand) return null;
  if (brand === 'visa') return 'Visa';
  if (brand === 'mastercard') return 'Mastercard';
  if (brand === 'amex') return 'American Express';
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe not configured. Set STRIPE_SECRET_KEY in Vercel env.' },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  let body: { setupIntentId?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const setupIntentId = typeof body.setupIntentId === 'string' ? body.setupIntentId.trim() : '';
  if (!SETUP_INTENT_RE.test(setupIntentId)) {
    return NextResponse.json({ error: 'invalid setupIntentId' }, { status: 400 });
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    const stripe = getStripe();
    const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] });

    // The SetupIntent must belong to this agreement — either through our own
    // metadata or through the customer already stored on the row.
    const siCustomerId = typeof si.customer === 'string' ? si.customer : (si.customer?.id ?? null);
    const metaAgreementId = si.metadata?.agreement_id ?? null;
    const belongs =
      metaAgreementId === ag.id ||
      (siCustomerId != null && siCustomerId === ag.stripe_customer_id);
    if (!belongs) {
      return NextResponse.json(
        { error: 'This SetupIntent does not belong to this agreement.' },
        { status: 400 },
      );
    }

    if (si.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Card was not saved (SetupIntent status: ${si.status}).` },
        { status: 400 },
      );
    }

    const pm = typeof si.payment_method === 'string' ? null : si.payment_method;
    const paymentMethodId = typeof si.payment_method === 'string' ? si.payment_method : (pm?.id ?? null);
    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'SetupIntent succeeded but carries no payment method.' },
        { status: 400 },
      );
    }

    const card = pm?.card ?? null;
    const cardBrand = prettyBrand(card?.brand);
    const cardLast4 = card?.last4 ?? null;
    const cardExp =
      card?.exp_month && card?.exp_year
        ? `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`
        : null;
    const cardholderName = pm?.billing_details?.name ?? null;
    const billingAddress = pm?.billing_details?.address ?? null;
    const cardholderAddress = billingAddress
      ? ([billingAddress.line1, billingAddress.line2, billingAddress.city, billingAddress.state, billingAddress.postal_code]
          .filter(Boolean)
          .join(', ') || null)
      : null;
    const customerId = siCustomerId ?? ag.stripe_customer_id ?? null;

    // Replace the saved card outright: this flow exists precisely to swap in a
    // new card, so brand / last4 / expiration must NOT be COALESCE-preserved
    // from the old one. Cardholder name / address only overwrite when Stripe
    // actually collected them.
    await sql`
      UPDATE agreements SET
        stripe_customer_id = COALESCE(${customerId}, stripe_customer_id),
        stripe_payment_method_id = ${paymentMethodId},
        payment_mode = COALESCE(payment_mode, 'card'),
        card_type = COALESCE(${cardBrand}, card_type),
        card_number_last4 = COALESCE(${cardLast4}, card_number_last4),
        card_expiration = COALESCE(${cardExp}, card_expiration),
        cardholder_name = COALESCE(${cardholderName}, cardholder_name),
        cardholder_address = COALESCE(${cardholderAddress}, cardholder_address),
        updated_at = NOW()
      WHERE id = ${ag.id}
    `;

    const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
      audit_log: AgreementAuditEntry[] | null;
    }>;
    const newLog = appendAudit(auditRows[0]?.audit_log, {
      event: 'card_on_file_saved',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: `${cardBrand ?? 'Card'} \u2022\u2022\u2022\u2022${cardLast4 ?? '????'}${cardExp ? ` exp ${cardExp}` : ''} \u2014 seti: ${si.id}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;

    // Keep the advertiser display mirror (card_last4 / payment_mode) in sync,
    // exactly like the Stripe webhook does after a sign-time payment.
    const updatedRows = (await sql`SELECT * FROM agreements WHERE id = ${ag.id}`) as unknown as Agreement[];
    if (updatedRows[0]) {
      try {
        await syncAgreementToAdvertiser(updatedRows[0]);
      } catch (e) {
        console.warn('[admin/setup-intent/confirm] advertiser mirror sync failed:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      agreementId: ag.id,
      customerId,
      paymentMethodId,
      cardType: cardBrand,
      cardLast4,
      cardExpiration: cardExp,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/setup-intent/confirm] error:', msg);
    return NextResponse.json({ error: 'card save failed', detail: msg }, { status: 500 });
  }
});
