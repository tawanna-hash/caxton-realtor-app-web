// lib/wave-webhook.ts
//
// Outbound Wave invoice creation triggered after a successful Stripe payment.
//
// History:
//   * v1 (deprecated): fire-and-forget POST to a Zapier Catch Hook which then
//     ran Wave GraphQL mutations from a Code-by-Zapier step. Killed because
//     Zapier's free/Starter tier enforces a 1-second JavaScript execution
//     timeout that Wave's GraphQL API can't reliably meet for 3 sequential
//     mutations.
//   * v2 (current): call Wave's GraphQL API directly from this Next.js app.
//     No middleman, no timeout pressure, all 3 mutations run server-side with
//     a 15s budget per call. See lib/wave-direct.ts.
//
// Env vars (used by lib/wave-direct.ts):
//   WAVE_API_TOKEN          — full-access token
//   WAVE_BUSINESS_ID        — Caxton Publications business ID
//   WAVE_PAYMENT_ACCOUNT_ID — Stripe (Money in Transit) account ID
//
// If any are missing, this function silently no-ops so dev/test envs don't
// fail. Stripe payment success is never blocked by Wave delivery failure;
// failures are logged and the agreement is still marked paid.

import type { Agreement } from '@/lib/agreements';
import { createWaveInvoiceDirect } from '@/lib/wave-direct';

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

export async function fireWaveInvoiceWebhook(
  opts: FireWaveOpts
): Promise<{ ok: boolean; error?: string; invoiceNumber?: string }> {
  const totalCents = opts.baseAmountCents + opts.surchargeCents;
  const paidAtIso = new Date().toISOString();

  const result = await createWaveInvoiceDirect({
    companyName: opts.ag.company_name ?? 'Unknown Advertiser',
    advertiserEmail: opts.ag.advertiser_email ?? opts.ag.billing_email ?? null,
    repName: opts.ag.rep_name ?? null,
    adSize: opts.ag.ad_size ?? null,
    frequency: opts.ag.frequency ?? null,
    issueMonth: opts.issueMonth ?? null,
    totalCents,
    stripePaymentIntentId: opts.stripePaymentIntentId,
    paidAtIso,
    notes: `${opts.ag.ad_size ?? 'ad'} \u2014 ${opts.ag.frequency ?? 'monthly'}${
      opts.issueMonth ? ` \u2014 ${opts.issueMonth}` : ''
    } \u2014 agreement ${opts.ag.id}`,
  });

  if (!result.ok) {
    console.error('[wave-webhook] createWaveInvoiceDirect failed:', result.error);
    return { ok: false, error: result.error };
  }

  if (result.invoiceNumber) {
    console.log(
      `[wave-webhook] Wave invoice #${result.invoiceNumber} created for agreement ${opts.ag.id} ($${result.amount})`
    );
  }

  return { ok: true, invoiceNumber: result.invoiceNumber };
}
