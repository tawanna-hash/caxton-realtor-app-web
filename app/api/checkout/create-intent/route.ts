// app/api/checkout/create-intent/route.ts
//
// POST — public endpoint. Creates a Stripe PaymentIntent for a self-serve
// ad booking. Amount is computed server-side from APP_AD_SLOTS so the
// client cannot tamper with pricing.
//
// Body:
//   { slot, pub, billing_period, weeks?, name, email, company?, phone?, start_date, end_date, click_url, alt_text? }
//
// Returns:
//   { clientSecret, publishableKey, paymentIntentId, amountCents, baseCents, surchargeCents }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getStripe,
  isStripeConfigured,
  withSurcharge,
  getPublishableKey,
} from '@/lib/stripe';
import { APP_AD_SLOTS, getSlotAvailablePubs } from '@/lib/media-kit';
import { getBookedPubsForSlot } from '@/lib/server/slot-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  slot: z.string().trim().min(1),
  pub: z.enum(['realtyline', 'newsline', 'both']),
  billing_period: z.enum(['weekly', 'monthly', 'unit']),
  weeks: z.number().int().min(1).max(52).optional().default(1),
  months: z.number().int().min(1).max(12).optional().default(1),
  units: z.number().int().min(1).max(20).optional().default(1),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  company: z.string().trim().max(200).optional().default(''),
  phone: z.string().trim().max(50).optional().default(''),
  start_date: z.string().trim().min(8).max(32),
  end_date: z.string().trim().min(8).max(32),
  click_url: z.string().trim().url().max(2000),
  alt_text: z.string().trim().max(500).optional().default(''),
});

export function computeAmountCents(
  slot: (typeof APP_AD_SLOTS)[number],
  pub: 'realtyline' | 'newsline' | 'both',
  billing_period: 'weekly' | 'monthly' | 'unit',
  weeks: number,
  months: number,
  units: number,
): { baseCents: number; description: string } | { error: string } {
  const isBoth = pub === 'both';
  if (slot.pricingUnit === 'per send' || slot.pricingUnit === 'per push') {
    const rate = isBoth ? slot.weeklyBoth : slot.weeklySingle;
    return {
      baseCents: rate * 100 * units,
      description: `${units} ${slot.pricingUnit}${units > 1 ? 's' : ''} (${slot.pricingUnit === 'per send' ? 'newsletter' : 'push'})`,
    };
  }
  if (billing_period === 'monthly') {
    const rate = isBoth ? slot.monthlyBoth : slot.monthlySingle;
    if (!rate) return { error: 'Monthly pricing unavailable for this slot' };
    return { baseCents: rate * 100 * months, description: `${months} month${months > 1 ? 's' : ''}` };
  }
  // weekly default
  const rate = isBoth ? slot.weeklyBoth : slot.weeklySingle;
  return { baseCents: rate * 100 * weeks, description: `${weeks} week${weeks > 1 ? 's' : ''}` };
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: parsed.error.message },
      { status: 400 },
    );
  }
  const d = parsed.data;

  const slot = APP_AD_SLOTS.find((s) => s.slug === d.slot);
  if (!slot) return NextResponse.json({ error: 'unknown_slot' }, { status: 400 });

  // Server-side guard #1 (static): the slot's pricing model itself must
  // support the requested scope (e.g. 'both' on a single-pub-only slot).
  const allowedPubs = getSlotAvailablePubs(slot);
  if (!allowedPubs.includes(d.pub)) {
    return NextResponse.json(
      {
        error: 'pub_not_available',
        detail: `Slot '${slot.slug}' is not sold on '${d.pub}'. Available: ${allowedPubs.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  // Server-side guard #2 (live): refuse to sell a scope that's currently
  // taken by another active campaign overlapping the requested window.
  // Reads ad_campaigns directly so an expired campaign auto-frees the slot.
  const bookedPubs = await getBookedPubsForSlot(slot.slug, d.start_date, d.end_date);
  if (bookedPubs.has(d.pub)) {
    return NextResponse.json(
      {
        error: 'pub_unavailable_active_campaign',
        detail: `Slot '${slot.slug}' is already booked on '${d.pub}' for the requested dates.`,
      },
      { status: 409 },
    );
  }

  const computed = computeAmountCents(
    slot,
    d.pub,
    d.billing_period,
    d.weeks,
    d.months,
    d.units,
  );
  if ('error' in computed) {
    return NextResponse.json({ error: computed.error }, { status: 400 });
  }
  const baseCents = computed.baseCents;
  const totalCents = withSurcharge(baseCents);
  const surchargeCents = totalCents - baseCents;

  try {
    const stripe = getStripe();

    // Dedupe customer by email
    let customerId: string | null = null;
    const found = await stripe.customers.list({ email: d.email, limit: 1 });
    if (found.data.length > 0) {
      customerId = found.data[0].id;
    } else {
      const created = await stripe.customers.create({
        email: d.email,
        name: d.company || d.name,
        phone: d.phone || undefined,
        metadata: { source: 'self_serve_checkout', publication: d.pub },
      });
      customerId = created.id;
    }

    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: `${slot.name} — ${computed.description} — ${d.pub}`,
      statement_descriptor_suffix: 'AD BOOKING',
      receipt_email: d.email,
      metadata: {
        source: 'self_serve_checkout',
        slot: d.slot,
        pub: d.pub,
        billing_period: d.billing_period,
        weeks: String(d.weeks),
        months: String(d.months),
        units: String(d.units),
        start_date: d.start_date,
        end_date: d.end_date,
        advertiser_name: d.company || d.name,
        advertiser_email: d.email,
        advertiser_phone: d.phone,
        rep_name: d.name,
        click_url: d.click_url,
        alt_text: d.alt_text,
        base_amount_cents: String(baseCents),
        surcharge_cents: String(surchargeCents),
      },
    });

    return NextResponse.json({
      clientSecret: pi.client_secret,
      publishableKey,
      paymentIntentId: pi.id,
      amountCents: totalCents,
      baseCents,
      surchargeCents,
      description: computed.description,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[checkout/create-intent] error:', msg);
    return NextResponse.json({ error: `payment intent failed: ${msg}` }, { status: 500 });
  }
}
