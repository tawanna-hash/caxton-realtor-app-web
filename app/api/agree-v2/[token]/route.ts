// app/api/agree-v2/[token]/route.ts
//
// New-partner agreements (Beta). Public (the HMAC token is the auth) API for
// the 3-screen Review / Pay / Sign page.
//
// GET  — pre-filled agreement summary.
// POST — accept: apply the partner's confirmed details and payment choice,
//        then hand off to the LIVE signing endpoint (/api/ad-sign/[token]) so
//        advertiser creation, CRM sync, reminders and notifications behave
//        exactly like a normal signature.
//
// Card payments are not handled here yet: partners who choose a card (or whose
// agreement is not a simple print ad) continue on the existing full form.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';
import { type Agreement } from '@/lib/agreements';
import { allowsCheckPayment } from '@/lib/ad-channels';
import { termsForChannel } from '@/lib/agreement-terms';
import { brandForPublication } from '@/lib/email-templates';
import { channelOfRow, needsFullForm, totalCents, recordNewPartnerEvent } from '@/lib/new-partner-v2/service';
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
  if (!ag || ag.is_renewal) return { sql, ag: null as Row | null };
  return { sql, ag };
}

const EDITABLE = [
  'company_name', 'rep_name', 'advertiser_email', 'advertiser_phone',
  'address', 'city', 'state', 'zip',
  'billing_email', 'billing_contact_name',
] as const;

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 401 });
  try {
    const { sql, ag } = await load(parsed.agreementId);
    if (!ag) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const preview = new URL(req.url).searchParams.get('preview') === '1';
    if (!preview && !ag.signed_at) {
      const opened = (ag.audit_log ?? []).some((e) => e.event === 'newpartner_v2_opened');
      if (!opened) await recordNewPartnerEvent(sql, ag.id, 'newpartner_v2_opened', 'Partner opened the agreement page');
    }

    const channel = channelOfRow(ag);
    const brand = brandForPublication(ag.publication);
    return NextResponse.json({
      id: ag.id,
      brand: brand.brandName,
      signed: Boolean(ag.signed_at),
      channel,
      ad_size: ag.ad_size,
      frequency: ag.frequency,
      rate_cents: ag.ad_rate_cents,
      total_cents: totalCents(ag),
      start_date: ag.start_date,
      end_date: ag.end_date,
      needs_full_form: needsFullForm(ag),
      full_form_url: `/admin/billing/sign/${token}`,
      allow_check: allowsCheckPayment(channel),
      fields: Object.fromEntries(EDITABLE.map((k) => [k, (ag as unknown as Record<string, unknown>)[k] ?? ''])),
      terms: termsForChannel(channel, ag.publication),
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
    if (ag.signed_at) return NextResponse.json({ error: 'This agreement is already signed.' }, { status: 409 });
    if (needsFullForm(ag)) {
      return NextResponse.json({ error: 'This agreement needs the full form.', code: 'needs_full_form' }, { status: 422 });
    }

    const mode = typeof body.paymentMode === 'string' ? body.paymentMode : '';
    if (mode === 'card') {
      return NextResponse.json({ error: 'Card payment continues on the full form.', code: 'needs_full_form' }, { status: 422 });
    }
    if (mode !== 'check' && mode !== 'invoice') {
      return NextResponse.json({ error: 'Please choose how you would like to pay.' }, { status: 400 });
    }
    if (!allowsCheckPayment(channelOfRow(ag))) {
      return NextResponse.json({ error: 'Check payment is not available for this agreement.' }, { status: 400 });
    }

    const patches: Record<string, unknown> = { payment_mode: mode };
    const given = (body.fields ?? {}) as Record<string, unknown>;
    for (const k of EDITABLE) {
      const v = given[k];
      if (typeof v === 'string') patches[k] = v.trim() || null;
    }
    const required: Array<[string, string]> = [
      ['company_name', 'company name'],
      ['rep_name', 'contact name'],
      ['advertiser_email', 'email'],
    ];
    for (const [k, label] of required) {
      const val = k in patches ? patches[k] : (ag as unknown as Record<string, unknown>)[k];
      if (!val || (typeof val === 'string' && !val.trim())) {
        return NextResponse.json({ error: `Please enter your ${label}.` }, { status: 400 });
      }
    }
    for (const k of ['advertiser_email', 'billing_email'] as const) {
      const v = patches[k];
      if (typeof v === 'string' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
      }
    }

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

    await recordNewPartnerEvent(sql, id, 'newpartner_v2_accepted', `Signed via the new-partner flow by "${signerName}" (${mode})`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'accept failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
