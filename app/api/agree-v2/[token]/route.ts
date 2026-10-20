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
// Card: the Pay step charges the first issue through the live PaymentIntent
// endpoint (/api/sign/[token]/payment-intent). Here we only accept 'card' after
// Stripe confirms that intent. Agreements that are not a simple print ad
// continue on the existing full form.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { verifyToken } from '@/lib/sign-token';
import { rateLimit } from '@/lib/server/rate-limit';
import { ApiError } from '@/lib/server/error';
import { type Agreement } from '@/lib/agreements';
import { allowsCheckPayment } from '@/lib/ad-channels';
import { termsForChannel } from '@/lib/agreement-terms';
import { brandForPublication } from '@/lib/email-templates';
import { channelOfRow, chargeBaseCents, needsFullForm, totalCents, recordNewPartnerEvent } from '@/lib/new-partner-v2/service';
import { cardTimeline, checkTimeline } from '@/lib/agreements-v2/timeline';
import { getDefaults } from '@/lib/agreements-v2/settings';
import { getAgreementMeta } from '@/lib/agreements-v2/builder';
import { invoiceRows, occurrenceGroups, plansForLines, type PaymentSettings } from '@/lib/agreements-v2/service-billing';
import { buildPlacementPatches, placementNeeds } from '@/lib/agreements-v2/placement';
import { createDraftScheduleForAgreement } from '@/lib/agreements-v2/recurring-draft';
import { getStripe, isStripeConfigured, withSurcharge } from '@/lib/stripe';
import { POST as liveSign } from '@/app/api/ad-sign/[token]/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ token: string }> };
type Row = Agreement & { channel?: string | null; line_count?: number; lines_total?: number; pay_now_total?: number };

async function load(id: string) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT ag.*,
      (SELECT COUNT(*)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS line_count,
      (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id) AS lines_total,
      (SELECT COALESCE(SUM(li.amount_cents), 0)::int FROM agreement_line_items li WHERE li.agreement_id = ag.id AND li.pay_now = true) AS pay_now_total
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
    const lines = (await sql`
      SELECT line_no, package_label, channel, ad_size, frequency, quantity, amount_cents, pay_now, start_date, end_date, preferred_send_dates
        FROM agreement_line_items WHERE agreement_id = ${ag.id} ORDER BY line_no
    `.catch(() => [])) as unknown as Array<Record<string, unknown>>;
    const base = chargeBaseCents(ag);
    const surcharged = base ? withSurcharge(base) : null;
    const defaults = await getDefaults(sql);
    const meta = await getAgreementMeta(ag.id, sql);
    const expired = Boolean(meta?.expires_at && meta.expires_at < new Date().toISOString().slice(0, 10) && !ag.signed_at);
    const tlAgreement = { ...ag, ad_rate_cents: ag.ad_rate_cents, amount_cents: (ag.lines_total ?? 0) > 0 ? ag.lines_total : ag.amount_cents } as Agreement;
    const payOpts: PaymentSettings = { card: meta?.payment?.card !== false, check: meta?.payment?.check !== false, due_days: meta?.payment?.due_days ?? null, show_schedule: meta?.payment?.show_schedule !== false, schedule_view: meta?.payment?.schedule_view === 'occurrence' ? 'occurrence' : 'timeline' };
    // Per-service billing options saved with the agreement drive the schedule the partner sees.
    let perService: ReturnType<typeof checkTimeline> | null = null;
    const startIso = ag.start_date ? new Date(ag.start_date as unknown as string).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const svcPlans = meta ? plansForLines(lines as unknown as Array<{ line_no: number; package_label: string; amount_cents: number }>, meta.services, { start: startIso, billing_day: typeof defaults.billing_day === 'number' ? defaults.billing_day : 1 }) : null;
    if (svcPlans) {
      const rows = invoiceRows(svcPlans, payOpts.due_days ?? defaults.due_days ?? 15);
      const manual = svcPlans.filter((p) => p.manual).map((p) => p.label);
      perService = {
        ok: true,
        hidden: Math.max(0, rows.length - 12),
        entries: [
          { date: null, label: 'Agreement signed', amount_cents: null },
          ...rows.slice(0, 12).flatMap((r, i) => [
            { date: r.date, label: `Invoice ${i + 1} issued`, amount_cents: r.total, note: r.items.map((x) => x.label).join(', ') },
            { date: r.due, label: `Invoice ${i + 1} due`, amount_cents: r.total },
          ]),
          ...(manual.length ? [{ date: null, label: `Billed manually: ${manual.join(', ')}`, amount_cents: null, note: 'You will be invoiced when billing starts' }] : []),
        ],
      };
    }
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
      lines: lines.map((l) => {
        const m = meta?.services.find((x) => x.line_no === l.line_no);
        return { ...l, package_label: m?.name || l.package_label, description: m?.description || null };
      }),
      details: meta ? { name: meta.name, note: meta.note, ask_address: meta.ask_address, refs: meta.refs.filter((r) => r.client_facing), expires_at: meta.expires_at } : null,
      expired,
      placement: placementNeeds({ ...ag, channel } as never, lines as never),
      card_available: isStripeConfigured() && base != null && payOpts.card,
      card_base_cents: base,
      card_charge_cents: surcharged,
      timeline_check: !payOpts.show_schedule || !allowsCheckPayment(channel) ? null : perService ?? checkTimeline(tlAgreement, defaults),
      timeline_card: payOpts.show_schedule ? cardTimeline(ag, base, surcharged) : null,
      schedule_hidden: !payOpts.show_schedule,
      schedule_view: payOpts.schedule_view,
      schedule_groups: payOpts.show_schedule && svcPlans ? occurrenceGroups(svcPlans) : null,
      full_form_url: `/admin/billing/sign/${token}`,
      allow_check: allowsCheckPayment(channel) && payOpts.check,
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
    const meta = await getAgreementMeta(ag.id, sql);
    if (meta?.expires_at && meta.expires_at < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: 'This agreement has expired. Please contact us for a new one.' }, { status: 410 });
    }
    if (needsFullForm(ag)) {
      return NextResponse.json({ error: 'This agreement needs the full form.', code: 'needs_full_form' }, { status: 422 });
    }

    const mode = typeof body.paymentMode === 'string' ? body.paymentMode : '';
    if (mode === 'card') {
      // The card was charged on the Pay step through the live PaymentIntent
      // endpoint. Only accept it if Stripe confirms that intent went through.
      const piId = ag.stripe_payment_intent_id;
      if (!isStripeConfigured() || !piId) {
        return NextResponse.json({ error: 'Please enter your card on the payment step.' }, { status: 402 });
      }
      try {
        const pi = await getStripe().paymentIntents.retrieve(piId);
        if (!['succeeded', 'processing', 'requires_capture'].includes(pi.status)) {
          return NextResponse.json({ error: 'Your card payment was not completed. Please go back and try again.' }, { status: 402 });
        }
      } catch {
        return NextResponse.json({ error: 'We could not confirm your card payment. Please try again.' }, { status: 402 });
      }
    }
    if (mode !== 'check' && mode !== 'card') {
      return NextResponse.json({ error: 'Please choose how you would like to pay.' }, { status: 400 });
    }
    if (mode === 'card' && meta?.payment?.card === false) {
      return NextResponse.json({ error: 'Credit card payment is not available for this agreement.' }, { status: 400 });
    }
    if (mode === 'check' && meta?.payment?.check === false) {
      return NextResponse.json({ error: 'Check payment is not available for this agreement.' }, { status: 400 });
    }
    if (mode !== 'card' && !allowsCheckPayment(channelOfRow(ag))) {
      return NextResponse.json({ error: 'Check payment is not available for this agreement.' }, { status: 400 });
    }

    const patches: Record<string, unknown> = { payment_mode: mode };
    const given = (body.fields ?? {}) as Record<string, unknown>;
    for (const k of EDITABLE) {
      const v = given[k];
      if (typeof v === 'string') patches[k] = v.trim() || null;
    }
    const required: Array<[string, string]> = [
      ...(meta?.ask_address ? ([['address', 'street address'], ['city', 'city'], ['state', 'state'], ['zip', 'ZIP code']] as Array<[string, string]>) : []),
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

    // Extra details for non-print products (send dates, app start dates).
    const lineRows = (await sql`
      SELECT line_no, package_label, channel, frequency, quantity, start_date, preferred_send_dates
        FROM agreement_line_items WHERE agreement_id = ${id} ORDER BY line_no
    `.catch(() => [])) as unknown as Parameters<typeof placementNeeds>[1];
    const needs = placementNeeds(channelOfRow(ag) === 'print' ? { ...ag, channel: 'print' } as never : { ...ag, channel: channelOfRow(ag) } as never, lineRows);
    if (needs.lines.length || needs.single) {
      const built = buildPlacementPatches(needs, body.placement as never, new Date().toISOString().slice(0, 10));
      if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });
      Object.assign(patches, built.patches);
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
    // Phase 3: draft recurring schedule for review. Never blocks the signing.
    await createDraftScheduleForAgreement(sql, id, null);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: 'accept failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
