// app/api/checkout/submit/route.ts
//
// POST — called by /advertise/checkout/[slot] after the Stripe confirmPayment
// succeeds (on the client). Persists:
//   - ad_creatives row (blob URL from the public upload-token route)
//   - ad_campaigns row tied to that creative + advertiser
//   - agreements row (snapshot for the books, awaiting signed status from the webhook)
//
// This route is also safe to re-run: it looks up the campaign by paymentIntentId
// in agreements.stripe_payment_intent_id and returns the existing IDs.
//
// Body: { paymentIntentId, blob_url, blob_pathname?, width?, height? }
// (All advertiser + slot + dates etc. are pulled from PaymentIntent.metadata
//  so the client cannot tamper with them.)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSql, ensureSchema } from '@/lib/db';
import { getStripe, isStripeConfigured } from '@/lib/stripe';
import { APP_AD_SLOTS } from '@/lib/media-kit';
import { deriveChannelFromSlot } from '@/lib/ad-channels';
import { randomUUID } from 'crypto';
import { appendAudit } from '@/lib/agreements';

/**
 * Convert the rate-card publication enum ('realtyline'|'newsline'|'both')
 * to the DB enum ('austin'|'san_antonio'|'both'). The ad_campaigns table
 * stores DB enum values; any other code that reads ad_campaigns.publication
 * (admin views, slot-availability) expects DB enum.
 */
function normalizeDbPub(raw: string): 'austin' | 'san_antonio' | 'both' {
  const v = (raw || '').toLowerCase().trim();
  if (v === 'newsline' || v === 'san_antonio') return 'san_antonio';
  if (v === 'both') return 'both';
  return 'austin'; // 'realtyline' OR fallback
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  paymentIntentId: z.string().trim().min(3),
  blob_url: z.string().trim().url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
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
  const { paymentIntentId, blob_url, width, height } = parsed.data;

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!pi) return NextResponse.json({ error: 'pi_not_found' }, { status: 404 });

    const m = pi.metadata ?? {};
    if (m.source !== 'self_serve_checkout') {
      return NextResponse.json({ error: 'not_self_serve' }, { status: 400 });
    }

    const slotSlug = m.slot ?? '';
    const slot = APP_AD_SLOTS.find((s) => s.slug === slotSlug);
    if (!slot) return NextResponse.json({ error: 'unknown_slot' }, { status: 400 });

    const advertiserName = m.advertiser_name || m.rep_name || 'Advertiser';
    const advertiserEmail = m.advertiser_email || pi.receipt_email || '';
    const repName = m.rep_name || '';
    const phone = m.advertiser_phone || '';
    const startDate = m.start_date;
    const endDate = m.end_date;
    const rawPub = (m.pub as string) || 'realtyline';
    const pub = normalizeDbPub(rawPub);
    const channel = deriveChannelFromSlot(slotSlug) ?? 'digital';
    const clickUrl = m.click_url || 'https://realtynewsnow.app';
    const altText = m.alt_text || advertiserName;
    const baseCents = Number(m.base_amount_cents ?? pi.amount);
    const billingPeriod = (m.billing_period as string) || 'weekly';

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'missing_dates_in_metadata' }, { status: 400 });
    }

    await ensureSchema();
    const sql = getSql();

    // Idempotency: if we've already persisted this PI, return the existing IDs.
    const existing = (await sql`
      SELECT id, advertiser_id FROM agreements WHERE stripe_payment_intent_id = ${paymentIntentId} LIMIT 1
    `) as unknown as { id: string; advertiser_id: number | null }[];

    if (existing.length > 0) {
      const exCampaign = (await sql`
        SELECT id, creative_id FROM ad_campaigns
        WHERE notes LIKE ${'%' + paymentIntentId + '%'} LIMIT 1
      `) as unknown as { id: string; creative_id: string }[];
      return NextResponse.json({
        ok: true,
        already: true,
        agreementId: existing[0].id,
        campaignId: exCampaign[0]?.id ?? null,
        creativeId: exCampaign[0]?.creative_id ?? null,
      });
    }

    // 1) ad_creatives row
    const creativeId = randomUUID();
    await sql`
      INSERT INTO ad_creatives (id, advertiser_name, blob_url, width, height, click_url, alt_text, uploaded_by)
      VALUES (${creativeId}, ${advertiserName}, ${blob_url}, ${width ?? null}, ${height ?? null},
              ${clickUrl}, ${altText}, ${'self_serve:' + (advertiserEmail || 'anon')})
    `;

    // 2) ad_campaigns row — keep INACTIVE until webhook confirms payment
    const campaignId = randomUUID();
    const dollars = (baseCents / 100).toFixed(2);
    await sql`
      INSERT INTO ad_campaigns
        (id, advertiser_name, ad_space_slug, creative_id, publication, start_date, end_date,
         active, price_total, price_notes, notes, created_by, channel)
      VALUES
        (${campaignId}, ${advertiserName}, ${slot.slug}, ${creativeId}, ${pub},
         ${startDate}, ${endDate}, ${false}, ${dollars}, ${billingPeriod},
         ${'self-serve checkout, pi=' + paymentIntentId},
         ${'self_serve:' + (advertiserEmail || 'anon')},
         ${channel})
    `;

    // 3) advertiser row (idempotent by contact_email)
    let advertiserId: number | null = null;
    if (advertiserEmail) {
      const adRows = (await sql`
        SELECT id FROM advertisers WHERE LOWER(contact_email) = LOWER(${advertiserEmail}) LIMIT 1
      `) as unknown as { id: number }[];
      if (adRows.length > 0) {
        advertiserId = adRows[0].id;
      } else {
        const slug =
          (advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'advertiser') +
          '-' +
          Math.random().toString(36).slice(2, 8);
        const ins = (await sql`
          INSERT INTO advertisers (name, slug, contact_email, share_token)
          VALUES (${advertiserName}, ${slug}, ${advertiserEmail}, ${randomUUID()})
          RETURNING id
        `) as unknown as { id: number }[];
        advertiserId = ins[0]?.id ?? null;
      }
    }

    // 4) agreement row (status=draft until webhook flips to signed/active)
    const agreementId = randomUUID();
    const now = new Date().toISOString();
    const audit = appendAudit([], {
      event: 'self_serve_submitted',
      timestamp: now,
      user_email: advertiserEmail || undefined,
      details: `Self-serve checkout submitted, pi=${paymentIntentId}, slot=${slot.slug}`,
    });
    await sql`
      INSERT INTO agreements
        (id, advertiser_id, company_name, rep_name, advertiser_email, advertiser_phone,
         type, status, start_date, end_date,
         ad_size, frequency, ad_rate_cents, amount_cents,
         payment_mode,
         stripe_payment_intent_id,
         signer_name, terms_accepted, terms_accepted_at,
         notes, audit_log, created_by, channel)
      VALUES
        (${agreementId}, ${advertiserId}, ${advertiserName}, ${repName}, ${advertiserEmail}, ${phone},
         ${'other'}, ${'draft'}, ${startDate}, ${endDate},
         ${slot.name}, ${billingPeriod}, ${baseCents}, ${baseCents},
         ${'card'},
         ${paymentIntentId},
         ${repName || advertiserName}, ${true}, ${now},
         ${'Self-serve checkout. Slot=' + slot.slug + ' pub=' + pub},
         ${JSON.stringify(audit)}::jsonb,
         ${'self_serve:' + (advertiserEmail || 'anon')},
         ${channel})
    `;

    return NextResponse.json({
      ok: true,
      agreementId,
      campaignId,
      creativeId,
      advertiserId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[checkout/submit] error:', msg, stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
