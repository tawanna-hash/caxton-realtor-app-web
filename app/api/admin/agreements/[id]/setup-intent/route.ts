// app/api/admin/agreements/[id]/setup-intent/route.ts
//
// POST — Start a "save a card on file" flow for an already-signed agreement.
// Auth: admin required (mirrors ../charge-issue/route.ts).
//
// This is a SAVE-ONLY flow: it creates a Stripe SetupIntent (usage:
// 'off_session'), never a PaymentIntent, so nothing is charged. The card is
// captured client-side by AddCardDrawer.tsx with Stripe Elements +
// stripe.confirmSetup(), then persisted by the sibling
// POST ./setup-intent/confirm route.
//
// Flow:
//   1. Admin auth + UUID validation
//   2. Reuse agreement.stripe_customer_id when it still resolves in the active
//      Stripe account; otherwise find-by-email / create and persist it
//   3. Create a SetupIntent for that customer (usage: 'off_session')
//   4. Return { clientSecret, publishableKey, customerId, setupIntentId }

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getStripe, isStripeConfigured, getPublishableKey } from '@/lib/stripe';
import type { Agreement } from '@/lib/agreements';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(_req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Stripe not configured. Set STRIPE_SECRET_KEY in Vercel env.' },
      { status: 503 },
    );
  }
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured.' },
      { status: 503 },
    );
  }

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    const stripe = getStripe();

    // 1. Customer — reuse if the stored id still exists in the active Stripe
    //    account (same defensive check as the sign-wizard payment-intent route:
    //    rotating Stripe accounts leaves stale customer ids behind).
    let customerId = ag.stripe_customer_id ?? null;
    if (customerId) {
      try {
        const existingCustomer = await stripe.customers.retrieve(customerId);
        if (existingCustomer.deleted) customerId = null;
      } catch {
        customerId = null;
      }
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
          metadata: { agreement_id: ag.id, publication: 'RealtyLine' },
        });
        customerId = created.id;
      }
      await sql`UPDATE agreements SET stripe_customer_id = ${customerId}, updated_at = NOW() WHERE id = ${ag.id}`;
    }

    // 2. SetupIntent — always fresh. SetupIntents are cheap, single-use, and a
    //    reused one may already be in a terminal state from an earlier attempt.
    const si = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      description: `${ag.company_name ?? 'Partner'} \u2014 card on file`,
      metadata: {
        agreement_id: ag.id,
        source: 'admin_card_on_file',
        added_by: admin.email ?? '',
        publication: 'RealtyLine',
      },
    });

    return NextResponse.json({
      clientSecret: si.client_secret,
      publishableKey,
      customerId,
      setupIntentId: si.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/setup-intent] error:', msg);
    return NextResponse.json({ error: 'setup intent failed', detail: msg }, { status: 500 });
  }
});
