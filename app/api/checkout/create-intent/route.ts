// app/api/checkout/create-intent/route.ts
//
// POST -- public endpoint. Creates a Stripe PaymentIntent for a self-serve
// ad booking. Amount is computed server-side from APP_AD_SLOTS so the
// client cannot tamper with pricing.
//
// Phase 3 (2026-06-17): multi-market checkout. The client now sends a
// `pubs: string[]` array of 1-4 single-pub markets. Pricing scales by
// MARKET_MULTIPLIERS (1x / 1.7x / 2.4x / 3.0x). The legacy `pub: 'both'`
// shape is still accepted for back-compat (mapped to ['realtyline','newsline'])
// so admin tools and older clients keep working.
//
// Body (new shape):
//   { slot, pubs: string[], billing_period, weeks?, ... }
// Body (legacy shape, still accepted):
//   { slot, pub: string,    billing_period, weeks?, ... }
//
// Returns:
//   { clientSecret, publishableKey, paymentIntentId, amountCents,
//     baseCents, surchargeCents, description }

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getStripe,
  isStripeConfigured,
  withSurcharge,
  getPublishableKey,
} from '@/lib/stripe';
import {
  APP_AD_SLOTS,
  getSlotAvailablePubs,
  weeklyRateForMarkets,
  monthlyRateForMarkets,
  type MarketCount,
} from '@/lib/media-kit';
import { getBookedPubsForSlot, type CheckoutPub } from '@/lib/server/slot-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SINGLE_PUB = z.enum([
  'realtyline',
  'newsline',
  'realtyline-houston',
  'realtyline-dallas',
]);

// Accept either the new `pubs: string[]` shape or the legacy `pub: string`
// scalar (including the legacy 'both' value). The handler normalizes both
// into a canonical CheckoutPub[] before pricing.
const schema = z.object({
  slot: z.string().trim().min(1),
  pub: z
    .enum([
      'realtyline',
      'newsline',
      'realtyline-houston',
      'realtyline-dallas',
      'both',
    ])
    .optional(),
  pubs: z.array(SINGLE_PUB).min(1).max(4).optional(),
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

/**
 * Normalize the input shape into the canonical CheckoutPub[] (deduped,
 * order-preserving). Accepts:
 *   - pubs: ['realtyline', 'newsline-...']
 *   - pub:  'realtyline' (single)
 *   - pub:  'both'        (legacy Austin+SA bundle -> ['realtyline','newsline'])
 */
function resolvePubs(input: {
  pub?: string;
  pubs?: string[];
}): CheckoutPub[] | { error: string } {
  if (input.pubs && input.pubs.length > 0) {
    const out: CheckoutPub[] = [];
    for (const p of input.pubs) {
      if (!out.includes(p as CheckoutPub)) out.push(p as CheckoutPub);
    }
    return out;
  }
  if (input.pub === 'both') return ['realtyline', 'newsline'];
  if (input.pub) return [input.pub as CheckoutPub];
  return { error: 'missing pubs / pub' };
}

export function computeAmountCents(
  slot: (typeof APP_AD_SLOTS)[number],
  pubs: CheckoutPub[],
  billing_period: 'weekly' | 'monthly' | 'unit',
  weeks: number,
  months: number,
  units: number,
): { baseCents: number; description: string } | { error: string } {
  const n = pubs.length as MarketCount;
  if (n < 1 || n > 4) {
    return { error: `invalid market count: ${pubs.length}` };
  }
  const weeklyRate = weeklyRateForMarkets(slot, n);
  if (slot.pricingUnit === 'per send' || slot.pricingUnit === 'per push') {
    return {
      baseCents: weeklyRate * 100 * units,
      description: `${units} ${slot.pricingUnit}${units > 1 ? 's' : ''} (${slot.pricingUnit === 'per send' ? 'newsletter' : 'push'}) across ${n} market${n > 1 ? 's' : ''}`,
    };
  }
  if (billing_period === 'monthly') {
    const monthlyRate = monthlyRateForMarkets(slot, n);
    if (monthlyRate === null) {
      return { error: 'Monthly pricing unavailable for this slot' };
    }
    return {
      baseCents: monthlyRate * 100 * months,
      description: `${months} month${months > 1 ? 's' : ''} across ${n} market${n > 1 ? 's' : ''}`,
    };
  }
  return {
    baseCents: weeklyRate * 100 * weeks,
    description: `${weeks} week${weeks > 1 ? 's' : ''} across ${n} market${n > 1 ? 's' : ''}`,
  };
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

  // Resolve input shape -> canonical CheckoutPub[]
  const resolved = resolvePubs(d);
  if ('error' in resolved) {
    return NextResponse.json({ error: 'invalid_input', detail: resolved.error }, { status: 400 });
  }
  const pubs: CheckoutPub[] = resolved;

  // Server-side guard #1 (static): every requested pub must be sold on
  // this slot per the rate-card config.
  const allowedPubs = new Set<string>(getSlotAvailablePubs(slot));
  for (const p of pubs) {
    if (!allowedPubs.has(p)) {
      return NextResponse.json(
        {
          error: 'pub_not_available',
          detail: `Slot '${slot.slug}' is not sold on '${p}'.`,
        },
        { status: 400 },
      );
    }
  }

  // Server-side guard #2 (live): refuse to sell any pub that's currently
  // taken by another active campaign overlapping the requested window.
  const bookedPubs = await getBookedPubsForSlot(slot.slug, d.start_date, d.end_date);
  for (const p of pubs) {
    if (bookedPubs.has(p)) {
      return NextResponse.json(
        {
          error: 'pub_unavailable_active_campaign',
          detail: `Slot '${slot.slug}' is already booked on '${p}' for the requested dates.`,
        },
        { status: 409 },
      );
    }
  }

  const computed = computeAmountCents(
    slot,
    pubs,
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

  // Canonical comma-joined string for Stripe metadata + back-compat display.
  const pubsJoined = pubs.join(',');

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
        metadata: { source: 'self_serve_checkout', publication: pubsJoined },
      });
      customerId = created.id;
    }

    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      description: `${slot.name} -- ${computed.description} -- ${pubsJoined}`,
      statement_descriptor_suffix: 'AD BOOKING',
      receipt_email: d.email,
      metadata: {
        source: 'self_serve_checkout',
        slot: d.slot,
        // Canonical multi-market field (comma-joined).
        pubs: pubsJoined,
        // Legacy field for any downstream readers that still expect `pub`.
        // For 1-market bookings this is the single market; for 2-market
        // Austin+SA bookings it's 'both'; for 3+/other 2-market mixes it
        // mirrors `pubs` (comma-joined).
        pub:
          pubs.length === 1
            ? pubs[0]
            : pubs.length === 2 &&
              pubs.includes('realtyline') &&
              pubs.includes('newsline')
            ? 'both'
            : pubsJoined,
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
