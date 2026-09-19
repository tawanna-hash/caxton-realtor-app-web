import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appendAudit } from '@/lib/agreements';
import { ensureSchema, getSql } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { EBLASTS } from '@/lib/media-kit';
import { isPartnerDeletionTombstoned } from '@/lib/advertiser-deletion-tombstones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  paymentIntentId: z.string().trim().min(3).max(255),
});

function packageId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

function dbPublication(publication: string): string {
  if (publication === 'realtyline') return 'austin';
  if (publication === 'newsline') return 'san_antonio';
  if (publication === 'realtyline-houston' || publication === 'realtyline-dallas') {
    return publication;
  }
  return 'both';
}

export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
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

  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(
      parsed.data.paymentIntentId,
    );
    const metadata = paymentIntent.metadata ?? {};
    if (
      metadata.source !== 'self_serve_checkout' ||
      metadata.product_kind !== 'eblast'
    ) {
      return NextResponse.json({ error: 'not_self_serve_eblast' }, { status: 400 });
    }
    if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
      return NextResponse.json(
        { error: 'payment_not_completed' },
        { status: 409 },
      );
    }

    const pkg = EBLASTS.find(
      (candidate) => packageId(candidate.name) === metadata.package_id,
    );
    if (!pkg) {
      return NextResponse.json({ error: 'unknown_eblast_package' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();
    const existing = (await sql`
      SELECT id, advertiser_id
      FROM agreements
      WHERE stripe_payment_intent_id = ${paymentIntent.id}
      LIMIT 1
    `) as unknown as Array<{ id: string; advertiser_id: number | null }>;
    if (existing[0]) {
      return NextResponse.json({
        ok: true,
        already: true,
        agreementId: existing[0].id,
        advertiserId: existing[0].advertiser_id,
      });
    }

    const advertiserName = metadata.advertiser_name || 'Advertiser';
    const advertiserEmail = metadata.advertiser_email || paymentIntent.receipt_email || '';
    const repName = metadata.rep_name || advertiserName;
    const publication = dbPublication(metadata.publication || 'realtyline');
    const preferredDates = (metadata.preferred_send_dates || '')
      .split(',')
      .map((date) => date.trim())
      .filter(Boolean)
      .slice(0, 3);
    if (!advertiserEmail || preferredDates.length === 0) {
      return NextResponse.json(
        { error: 'missing_order_metadata' },
        { status: 400 },
      );
    }

    let advertiserId: number | null = null;
    const advertiserRows = (await sql`
      SELECT id
      FROM advertisers
      WHERE LOWER(contact_email) = LOWER(${advertiserEmail})
      LIMIT 1
    `) as unknown as Array<{ id: number }>;
    if (advertiserRows[0]) {
      advertiserId = advertiserRows[0].id;
    } else {
      const baseSlug =
        advertiserName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'advertiser';
      const wasDeleted = await isPartnerDeletionTombstoned({
        email: advertiserEmail,
        name: advertiserName,
        slug: baseSlug,
      });
      if (!wasDeleted) {
        const inserted = (await sql`
          INSERT INTO advertisers (name, slug, contact_email, share_token)
          VALUES (
            ${advertiserName},
            ${`${baseSlug}-${Math.random().toString(36).slice(2, 8)}`},
            ${advertiserEmail},
            ${randomUUID()}
          )
          RETURNING id
        `) as unknown as Array<{ id: number }>;
        advertiserId = inserted[0]?.id ?? null;
      }
    }

    const agreementId = randomUUID();
    const now = new Date().toISOString();
    const baseCents = Number(metadata.base_amount_cents || paymentIntent.amount);
    const sends = Math.max(1, Number(metadata.sends || pkg.sends));
    const creativeLine = metadata.creative_url
      ? `Creative: ${metadata.creative_url}${metadata.creative_filename ? ` (${metadata.creative_filename})` : ''}`
      : 'Creative: advertiser will provide after checkout';
    const notes = [
      'Self-serve e-Blast order.',
      `Subject: ${metadata.subject_line || ''}`,
      `From name: ${metadata.from_name || ''}`,
      `Destination: ${metadata.destination_url || ''}`,
      creativeLine,
      metadata.order_notes ? `Advertiser notes: ${metadata.order_notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const audit = appendAudit([], {
      event: 'self_serve_submitted',
      timestamp: now,
      user_email: advertiserEmail,
      details: `Self-serve e-Blast submitted, pi=${paymentIntent.id}, package=${metadata.package_id}`,
    });

    await sql`
      INSERT INTO agreements (
        id, advertiser_id, company_name, rep_name, advertiser_email,
        advertiser_phone, type, status, start_date, end_date,
        ad_size, frequency, ad_rate_cents, amount_cents, payment_mode,
        stripe_payment_intent_id, signer_name, terms_accepted,
        terms_accepted_at, notes, audit_log, created_by, channel,
        publication, preferred_send_dates, eblast_packages, billing_email
      ) VALUES (
        ${agreementId}, ${advertiserId}, ${advertiserName}, ${repName},
        ${advertiserEmail}, ${metadata.advertiser_phone || ''}, ${'eblast'},
        ${'draft'}, ${preferredDates[0]}, ${preferredDates[preferredDates.length - 1]},
        ${pkg.name}, ${`${sends} send${sends === 1 ? '' : 's'}`},
        ${baseCents}, ${baseCents}, ${'card'}, ${paymentIntent.id}, ${repName},
        ${true}, ${now}, ${notes}, ${JSON.stringify(audit)}::jsonb,
        ${`self_serve:${advertiserEmail}`}, ${'email'}, ${publication},
        ${JSON.stringify(preferredDates)}::jsonb,
        ${JSON.stringify([pkg.name])}::jsonb, ${advertiserEmail}
      )
    `;

    return NextResponse.json({
      ok: true,
      agreementId,
      advertiserId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[checkout/eblast/submit] error:', message);
    return NextResponse.json(
      { error: 'order_persistence_failed', detail: message },
      { status: 500 },
    );
  }
}
