// lib/wave-webhook.ts
//
// Fire-and-forget outbound webhook to Zapier (which routes to Wave).
// Configured via WAVE_ZAP_WEBHOOK_URL env var.
//
// Zap shape (suggested):
//   Trigger: Webhooks by Zapier → Catch Hook
//   Action:  Wave → Create Invoice (and optionally Record Payment)
//
// We do NOT block payment success on Zapier delivery; failures are logged
// and the agreement is still marked paid. If WAVE_ZAP_WEBHOOK_URL is unset
// the function silently no-ops, so dev/test envs don't error.

import type { Agreement } from '@/lib/agreements';

export interface WaveInvoicePayload {
  /** "agreement-signed" (first issue) or "issue-charge" (subsequent monthly). */
  event: 'agreement-signed' | 'issue-charge';
  agreement_id: string;
  company_name: string | null;
  advertiser_email: string | null;
  rep_name: string | null;
  ad_size: string | null;
  frequency: string | null;
  issue_month?: string | null;
  base_amount_cents: number;
  surcharge_cents: number;
  total_cents: number;
  stripe_customer_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id?: string | null;
  paid_at: string;
  publication: string;
  notes?: string;
}

export interface FireWaveOpts {
  ag: Agreement;
  event: WaveInvoicePayload['event'];
  baseAmountCents: number;
  surchargeCents: number;
  stripePaymentIntentId: string | null;
  stripeChargeId?: string | null;
  issueMonth?: string;
}

export async function fireWaveInvoiceWebhook(opts: FireWaveOpts): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.WAVE_ZAP_WEBHOOK_URL;
  if (!url) {
    // Not configured — silent skip. Caller stays unblocked.
    return { ok: true };
  }

  const totalCents = opts.baseAmountCents + opts.surchargeCents;
  const payload: WaveInvoicePayload = {
    event: opts.event,
    agreement_id: opts.ag.id,
    company_name: opts.ag.company_name ?? null,
    advertiser_email: opts.ag.advertiser_email ?? opts.ag.billing_email ?? null,
    rep_name: opts.ag.rep_name ?? null,
    ad_size: opts.ag.ad_size ?? null,
    frequency: opts.ag.frequency ?? null,
    issue_month: opts.issueMonth ?? null,
    base_amount_cents: opts.baseAmountCents,
    surcharge_cents: opts.surchargeCents,
    total_cents: totalCents,
    stripe_customer_id: opts.ag.stripe_customer_id ?? null,
    stripe_payment_intent_id: opts.stripePaymentIntentId,
    stripe_charge_id: opts.stripeChargeId ?? null,
    paid_at: new Date().toISOString(),
    publication: 'RealtyLine',
    notes: `${opts.ag.ad_size ?? 'ad'} \u2014 ${opts.ag.frequency ?? 'monthly'}${opts.issueMonth ? ` \u2014 ${opts.issueMonth}` : ''}`,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // Don't wait forever
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[wave-webhook] Zapier returned non-2xx:', res.status, txt.slice(0, 500));
      return { ok: false, error: `Zapier ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[wave-webhook] fetch failed:', msg);
    return { ok: false, error: msg };
  }
}
