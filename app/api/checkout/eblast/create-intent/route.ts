import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getPublishableKey,
  getStripe,
  isStripeConfigured,
  withSurcharge,
} from '@/lib/stripe';
import {
  EBLASTS,
  eblastPriceForPub,
  isEblastAvailableForPub,
  type EBlast,
  type MediaKitPub,
} from '@/lib/media-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicationSchema = z.enum(['realtyline', 'newsline', 'both']);
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  package_id: z.string().trim().min(1).max(100),
  publication: publicationSchema,
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(50).optional().default(''),
  company: z.string().trim().min(1).max(200),
  subject_line: z.string().trim().min(1).max(120),
  from_name: z.string().trim().min(1).max(120),
  destination_url: z.string().trim().url().max(480),
  preferred_send_dates: z
    .array(z.string().regex(isoDate))
    .min(1)
    .max(3),
  creative_url: z.string().trim().url().max(480).optional(),
  creative_filename: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(2000).optional().default(''),
});

function packageId(pkg: EBlast): string {
  return pkg.name.toLowerCase().replace(/\s+/g, '');
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }
  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      { error: 'Stripe publishable key not configured' },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
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
  const data = parsed.data;
  const pkg = EBLASTS.find((candidate) => packageId(candidate) === data.package_id);
  if (!pkg) {
    return NextResponse.json({ error: 'unknown_eblast_package' }, { status: 400 });
  }
  if (!isEblastAvailableForPub(pkg, data.publication as MediaKitPub)) {
    return NextResponse.json(
      { error: 'package_not_available_for_publication' },
      { status: 400 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  if (data.preferred_send_dates.some((date) => date < today)) {
    return NextResponse.json(
      { error: 'preferred_send_date_must_be_in_the_future' },
      { status: 400 },
    );
  }

  const baseCents =
    Math.round(eblastPriceForPub(pkg, data.publication as MediaKitPub) * 100);
  const amountCents = withSurcharge(baseCents);
  const surchargeCents = amountCents - baseCents;
  const sends = pkg.sendsByPub?.[data.publication] ?? pkg.sends;

  try {
    const stripe = getStripe();
    const found = await stripe.customers.list({ email: data.email, limit: 1 });
    const customer =
      found.data[0] ??
      (await stripe.customers.create({
        email: data.email,
        name: data.company,
        phone: data.phone || undefined,
        metadata: {
          source: 'self_serve_eblast',
          publication: data.publication,
        },
      }));

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: customer.id,
      automatic_payment_methods: { enabled: true },
      description: `${pkg.name} — ${data.publication} — ${sends} send${sends === 1 ? '' : 's'}`,
      statement_descriptor_suffix: 'E-BLAST',
      receipt_email: data.email,
      metadata: {
        source: 'self_serve_checkout',
        product_kind: 'eblast',
        package_id: data.package_id,
        package_name: pkg.name,
        publication: data.publication,
        sends: String(sends),
        preferred_send_dates: data.preferred_send_dates.join(','),
        advertiser_name: data.company,
        advertiser_email: data.email,
        advertiser_phone: data.phone,
        rep_name: data.name,
        subject_line: data.subject_line,
        from_name: data.from_name,
        destination_url: data.destination_url,
        creative_url: data.creative_url ?? '',
        creative_filename: data.creative_filename ?? '',
        order_notes: data.notes.slice(0, 480),
        base_amount_cents: String(baseCents),
        surcharge_cents: String(surchargeCents),
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey,
      paymentIntentId: paymentIntent.id,
      amountCents,
      baseCents,
      surchargeCents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[checkout/eblast/create-intent] error:', message);
    return NextResponse.json(
      { error: 'payment_intent_failed', detail: message },
      { status: 500 },
    );
  }
}
