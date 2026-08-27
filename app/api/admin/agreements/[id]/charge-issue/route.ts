// app/api/admin/agreements/[id]/charge-issue/route.ts
//
// POST — Charge the saved card for a subsequent issue (off-session).
// Auth: admin required.
//
// Body: { issueMonth?: string (e.g. "2026-07"), amountCents?: number (defaults to ad_rate * 1.03) }
//
// Uses the stored stripe_payment_method_id + stripe_customer_id from the agreement.
// Creates an issue_charges row, fires Stripe PaymentIntent with confirm:true off_session.

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { getStripe, isStripeConfigured, withSurcharge } from '@/lib/stripe';
import { appendAudit, type Agreement, type AgreementAuditEntry } from '@/lib/agreements';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type RouteCtx = { params: Promise<{ id: string }> };

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

  let body: { issueMonth?: string; amountCents?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body ok */
  }

  try {
    await ensureSchema();
    const sql = getSql();

    const rows = (await sql`SELECT * FROM agreements WHERE id = ${id}`) as unknown as Agreement[];
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const ag = rows[0];

    if (!ag.stripe_customer_id || !ag.stripe_payment_method_id) {
      return NextResponse.json(
        { error: 'No saved payment method on this agreement. Client must complete first sign-time payment first.' },
        { status: 400 },
      );
    }

    const baseCents = body.amountCents ?? ag.ad_rate_cents ?? 0;
    if (baseCents <= 0) {
      return NextResponse.json(
        { error: 'No charge amount: provide amountCents or set ad_rate_cents on the agreement.' },
        { status: 400 },
      );
    }
    const totalCents = withSurcharge(baseCents);
    const surchargeCents = totalCents - baseCents;
    const issueMonth = body.issueMonth ?? new Date().toISOString().slice(0, 7);

    const stripe = getStripe();

    // Create issue_charges row first (pending)
    const chargeRows = (await sql`
      INSERT INTO issue_charges (agreement_id, amount_cents, surcharge_cents, issue_month, status, created_by)
      VALUES (${ag.id}, ${totalCents}, ${surchargeCents}, ${issueMonth}, 'pending', ${admin.email})
      RETURNING id
    `) as unknown as Array<{ id: string }>;
    const issueChargeId = chargeRows[0].id;

    let pi: import('stripe').Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.create({
        amount: totalCents,
        currency: 'usd',
        customer: ag.stripe_customer_id,
        payment_method: ag.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        description: `${ag.company_name ?? 'Partner'} \u2014 ${ag.ad_size ?? 'ad'} \u2014 ${issueMonth}`,
        statement_descriptor: 'REALTYLINE AUSTIN',
        receipt_email: ag.advertiser_email ?? ag.billing_email ?? undefined,
        metadata: {
          agreement_id: ag.id,
          issue_charge_id: issueChargeId,
          issue_month: issueMonth,
          base_amount_cents: String(baseCents),
          surcharge_cents: String(surchargeCents),
          publication: 'RealtyLine',
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      await sql`UPDATE issue_charges SET status = 'failed', failure_reason = ${msg}, updated_at = NOW() WHERE id = ${issueChargeId}`;
      const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
        audit_log: AgreementAuditEntry[] | null;
      }>;
      const newLog = appendAudit(auditRows[0]?.audit_log, {
        event: 'issue_charge_failed',
        timestamp: new Date().toISOString(),
        user_email: admin.email,
        details: `${issueMonth} \u2014 ${msg}`,
      });
      await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;
      captureServerEvent('issue_charge_failed', admin?.email ?? 'server', {
        surface: 'admin_agreements',
        agreement_id: id,
        detail: msg,
        stage: 'stripe_charge',
      });
      await flushServerEvents();
      return NextResponse.json({ error: 'charge failed', detail: msg }, { status: 402 });
    }

    const chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : (pi.latest_charge?.id ?? null);
    const succeeded = pi.status === 'succeeded';

    await sql`
      UPDATE issue_charges SET
        stripe_payment_intent_id = ${pi.id},
        stripe_charge_id = ${chargeId},
        status = ${succeeded ? 'succeeded' : 'pending'},
        charged_at = ${succeeded ? new Date().toISOString() : null},
        updated_at = NOW()
      WHERE id = ${issueChargeId}
    `;

    const auditRows = (await sql`SELECT audit_log FROM agreements WHERE id = ${ag.id}`) as unknown as Array<{
      audit_log: AgreementAuditEntry[] | null;
    }>;
    const newLog = appendAudit(auditRows[0]?.audit_log, {
      event: succeeded ? 'issue_charge_succeeded' : 'issue_charge_pending',
      timestamp: new Date().toISOString(),
      user_email: admin.email,
      details: `${issueMonth} \u2014 ${(totalCents / 100).toFixed(2)} USD \u2014 pi: ${pi.id}`,
    });
    await sql`UPDATE agreements SET audit_log = ${JSON.stringify(newLog)}::jsonb WHERE id = ${ag.id}`;

    if (succeeded) {
      captureServerEvent('issue_charge_succeeded', admin?.email ?? 'server', {
        surface: 'admin_agreements',
        agreement_id: id,
        payment_intent_id: pi.id,
      });
      await flushServerEvents();
    }
    return NextResponse.json({
      ok: succeeded,
      issueChargeId,
      paymentIntentId: pi.id,
      status: pi.status,
      amountCents: totalCents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin/charge-issue] error:', msg);
    return NextResponse.json({ error: 'charge failed', detail: msg }, { status: 500 });
  }
});
