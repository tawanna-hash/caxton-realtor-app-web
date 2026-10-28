// app/api/renew-v2/[token]/route.ts
//
// Renewals (Beta). Public (the HMAC token is the auth) API for the one-tap
// renewal page.
//
// GET  — pre-filled renewal summary.
// POST — accept: apply the partner's confirmed billing/payment choices, then
//        hand off to the LIVE signing endpoint (/api/ad-sign/[token]) so print
//        re-anchoring, CRM sync, advertiser linking and notifications behave
//        exactly like a normal signature.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';
import { type Agreement } from '@/lib/agreements';
import { allowsCheckPayment, deriveChannelFromAgreementType, isAdChannel } from '@/lib/ad-channels';
import { isRenewalOfferExpired, RENEWAL_OFFER_EXPIRED_MESSAGE } from '@/lib/renewal-offer';
import { termsTextFor } from '@/lib/server/agreement-terms-store';
import { brandForPublication } from '@/lib/email-templates';
import { freqMonths } from '@/lib/renewals-v2/pricing';
import { recordEvent } from '@/lib/renewals-v2/service';
import { createDraftScheduleForAgreement } from '@/lib/agreements-v2/recurring-draft';
import { POST as liveSign } from '@/app/api/ad-sign/[token]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };
type Row = Agreement & { channel?: string | null; line_count?: number };

async function load(id: string) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ag.*, (SELECT COUNT(*)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS line_count
      FROM agreements ag WHERE ag.id = ${id}
  ` as unknown as Row[];
  const ag = rows[0];
  if (!ag || !ag.is_renewal || !ag.renewed_from_id) return { sql, ag: null as Row | null };
  return { sql, ag };
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 401 });
  try {
    const { sql, ag } = await load(parsed.agreementId);
    if (!ag) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const preview = new URL(req.url).searchParams.get('preview') === '1';
    if (!preview && !ag.signed_at) {
      const opened = (ag.audit_log ?? []).some((e) => e.event === 'renewal_v2_opened');
      if (!opened) await recordEvent(sql, ag.id, 'renewal_v2_opened', 'Partner opened the renewal page');
    }

    const channel = isAdChannel(ag.channel) ? ag.channel : deriveChannelFromAgreementType(ag.type);
    const months = freqMonths(ag.frequency);
    const brand = brandForPublication(ag.publication);
    const cardOnFile = ag.stripe_payment_method_id && ag.card_number_last4
      ? { brand: ag.card_type ?? 'Card', last4: ag.card_number_last4 }
      : null;
    return NextResponse.json({
      id: ag.id,
      brand: brand.brandName,
      signed: Boolean(ag.signed_at),
      offer_expired: isRenewalOfferExpired(ag),
      offer_expires_at: ag.renewal_offer_expires_at,
      company_name: ag.company_name,
      rep_name: ag.rep_name,
      channel,
      ad_size: ag.ad_size,
      frequency: ag.frequency,
      months,
      rate_cents: ag.ad_rate_cents,
      total_cents: ag.ad_rate_cents != null ? ag.ad_rate_cents * months : null,
      start_date: ag.start_date,
      end_date: ag.end_date,
      needs_full_form: channel !== 'print' || (ag.line_count ?? 0) > 0,
      full_form_url: `/admin/billing/sign/${token}`,
      allow_check: allowsCheckPayment(channel),
      card_on_file: cardOnFile,
      payment_mode: ag.payment_mode,
      billing: {
        email: ag.billing_email ?? ag.advertiser_email,
        contact_name: ag.billing_contact_name ?? ag.rep_name,
      },
      terms: await termsTextFor(null),
    });
  } catch (err) {
    return NextResponse.json({ error: 'load failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 401 });
  const id = parsed.agreementId;

  try {
    await rateLimit('signWizard', id);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 429) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }
    throw err;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const signerName = typeof body.signerName === 'string' ? body.signerName.trim() : '';
  if (!signerName) return NextResponse.json({ error: 'Please type your full name to sign.' }, { status: 400 });
  if (body.termsAccepted !== true) return NextResponse.json({ error: 'Please accept the terms to continue.' }, { status: 400 });

  try {
    const { sql, ag } = await load(id);
    if (!ag) return NextResponse.json({ error: 'not found' }, { status: 404 });
    if (ag.signed_at) return NextResponse.json({ error: 'This renewal is already signed.' }, { status: 409 });
    if (isRenewalOfferExpired(ag)) {
      return NextResponse.json({ error: RENEWAL_OFFER_EXPIRED_MESSAGE, code: 'renewal_offer_expired' }, { status: 410 });
    }
    const channel = isAdChannel(ag.channel) ? ag.channel : deriveChannelFromAgreementType(ag.type);
    if (channel !== 'print' || (ag.line_count ?? 0) > 0) {
      return NextResponse.json({ error: 'This renewal needs the full form.', code: 'needs_full_form' }, { status: 422 });
    }

    const mode = typeof body.paymentMode === 'string' ? body.paymentMode : '';
    const patches: Record<string, unknown> = {};
    if (mode === 'card') {
      if (!ag.stripe_payment_method_id) {
        return NextResponse.json({ error: 'No card on file. Please use the full form to add a card.', code: 'needs_full_form' }, { status: 422 });
      }
      patches.payment_mode = 'card';
    } else if (mode === 'check') {
      if (!allowsCheckPayment(channel)) {
        return NextResponse.json({ error: 'Check payment is not available for this agreement.' }, { status: 400 });
      }
      patches.payment_mode = mode;
    } else {
      return NextResponse.json({ error: 'Please choose how you would like to pay.' }, { status: 400 });
    }
    for (const k of ['billing_email', 'billing_contact_name', 'billing_contact_phone'] as const) {
      const v = body[k];
      if (typeof v === 'string') patches[k] = v.trim() || null;
    }
    if (typeof patches.billing_email === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patches.billing_email)) {
      return NextResponse.json({ error: 'Please enter a valid billing email.' }, { status: 400 });
    }

    // Hand off to the live signer with the confirmed patches. It applies
    // them, signs, re-anchors print dates, syncs the CRM and notifies admins.
    const liveReq = new NextRequest(new URL(`/api/ad-sign/${token}`, req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signerName,
        signedAt: new Date().toISOString().slice(0, 10),
        termsAccepted: true,
        signMethod: 'type',
        patches,
      }),
    });
    const res = await liveSign(liveReq, { params: Promise.resolve({ token }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    await recordEvent(sql, id, 'renewal_v2_accepted', `Accepted via one-tap renewal by "${signerName}" (${mode})`);
    // Phase 3: draft recurring schedule for review. Never blocks the signing.
    await createDraftScheduleForAgreement(sql, id, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'accept failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
