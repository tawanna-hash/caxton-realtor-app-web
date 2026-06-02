// app/api/cron/retry-wave-sync/route.ts
//
// Hourly cron that retries Wave invoice creation for any agreement or issue
// charge whose Wave sync failed (or never ran). Picks up rows where:
//   * agreements:    paid_at IS NOT NULL AND wave_invoice_synced_at IS NULL
//   * issue_charges: status = 'succeeded' AND wave_invoice_synced_at IS NULL
//
// Uses the same atomic claim pattern as the Stripe webhook — a conditional
// UPDATE reserves each row before calling Wave, so concurrent cron runs (or
// a webhook firing simultaneously) can't double-bill.
//
// Cap of 25 rows per run keeps us well inside Vercel's 300s budget and Wave's
// rate limits (3 GraphQL calls per row × ~600ms each = ~45s worst case).
//
// Auth: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.

import { getSql, ensureSchema } from '@/lib/db';
import { fireWaveInvoiceWebhook } from '@/lib/wave-webhook';
import type { Agreement } from '@/lib/agreements';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BATCH_LIMIT = 25;
const MAX_ATTEMPTS = 5; // Stop retrying after this many failures to avoid hammering Wave forever.

interface IssueChargeRow {
  id: string;
  agreement_id: string;
  amount_cents: number;
  surcharge_cents: number;
  issue_month: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
}

export async function GET(req: Request) {
  // ---- auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    return Response.json(
      { error: 'cron_secret_missing', message: 'Set CRON_SECRET to enable this cron.' },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  let agreementsProcessed = 0;
  let agreementsSucceeded = 0;
  let agreementsFailed = 0;
  let issueChargesProcessed = 0;
  let issueChargesSucceeded = 0;
  let issueChargesFailed = 0;

  try {
    await ensureSchema();
    const sql = getSql();

    // ---- agreements pass ----
    const pendingAgreements = (await sql`
      SELECT * FROM agreements
       WHERE paid_at IS NOT NULL
         AND wave_invoice_synced_at IS NULL
         AND COALESCE(wave_sync_attempts, 0) < ${MAX_ATTEMPTS}
       ORDER BY paid_at ASC
       LIMIT ${BATCH_LIMIT}
    `) as unknown as Agreement[];

    for (const ag of pendingAgreements) {
      agreementsProcessed += 1;

      const claim = (await sql`
        UPDATE agreements
           SET wave_invoice_synced_at = NOW(),
               wave_sync_attempts     = COALESCE(wave_sync_attempts, 0) + 1,
               wave_sync_error        = NULL
         WHERE id = ${ag.id}
           AND wave_invoice_synced_at IS NULL
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      if (claim.length === 0) {
        // Someone else (a webhook delivery, another cron worker) beat us.
        continue;
      }

      const baseAmountCents = ag.stripe_charged_cents ?? 0;
      // We don't have the original surcharge split stored — re-derive from the
      // 3% rule used at charge time. If base+surcharge already equals charged,
      // this is exact; otherwise the math is close enough for a one-line item.
      const surchargeCents = Math.round(baseAmountCents - baseAmountCents / 1.03);
      const baseCents = baseAmountCents - surchargeCents;

      const result = await fireWaveInvoiceWebhook({
        ag,
        event: 'agreement-signed',
        baseAmountCents: baseCents,
        surchargeCents,
        stripePaymentIntentId: ag.stripe_payment_intent_id,
        stripeChargeId: null,
      });

      if (result.ok) {
        agreementsSucceeded += 1;
        if (result.invoiceNumber) {
          await sql`UPDATE agreements SET wave_invoice_id = ${result.invoiceNumber} WHERE id = ${ag.id}`;
        }
      } else {
        agreementsFailed += 1;
        await sql`
          UPDATE agreements
             SET wave_invoice_synced_at = NULL,
                 wave_sync_error        = ${result.error ?? 'unknown wave error'}
           WHERE id = ${ag.id}
        `;
      }
    }

    // ---- issue_charges pass ----
    const pendingCharges = (await sql`
      SELECT ic.id, ic.agreement_id, ic.amount_cents, ic.surcharge_cents,
             ic.issue_month, ic.stripe_payment_intent_id, ic.stripe_charge_id
        FROM issue_charges ic
       WHERE ic.status = 'succeeded'
         AND ic.wave_invoice_synced_at IS NULL
         AND COALESCE(ic.wave_sync_attempts, 0) < ${MAX_ATTEMPTS}
       ORDER BY ic.charged_at ASC
       LIMIT ${BATCH_LIMIT}
    `) as unknown as IssueChargeRow[];

    for (const ic of pendingCharges) {
      issueChargesProcessed += 1;

      const claim = (await sql`
        UPDATE issue_charges
           SET wave_invoice_synced_at = NOW(),
               wave_sync_attempts     = COALESCE(wave_sync_attempts, 0) + 1,
               wave_sync_error        = NULL
         WHERE id = ${ic.id}
           AND wave_invoice_synced_at IS NULL
        RETURNING id
      `) as unknown as Array<{ id: string }>;
      if (claim.length === 0) continue;

      const agRows = (await sql`SELECT * FROM agreements WHERE id = ${ic.agreement_id}`) as unknown as Agreement[];
      if (agRows.length === 0) {
        await sql`
          UPDATE issue_charges
             SET wave_invoice_synced_at = NULL,
                 wave_sync_error        = 'parent agreement not found'
           WHERE id = ${ic.id}
        `;
        issueChargesFailed += 1;
        continue;
      }

      const result = await fireWaveInvoiceWebhook({
        ag: agRows[0],
        event: 'issue-charge',
        baseAmountCents: ic.amount_cents,
        surchargeCents: ic.surcharge_cents,
        stripePaymentIntentId: ic.stripe_payment_intent_id,
        stripeChargeId: ic.stripe_charge_id,
        issueMonth: ic.issue_month ?? undefined,
      });

      if (result.ok) {
        issueChargesSucceeded += 1;
        if (result.invoiceNumber) {
          await sql`UPDATE issue_charges SET wave_invoice_id = ${result.invoiceNumber} WHERE id = ${ic.id}`;
        }
      } else {
        issueChargesFailed += 1;
        await sql`
          UPDATE issue_charges
             SET wave_invoice_synced_at = NULL,
                 wave_sync_error        = ${result.error ?? 'unknown wave error'}
           WHERE id = ${ic.id}
        `;
      }
    }

    return Response.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      agreements: {
        processed: agreementsProcessed,
        succeeded: agreementsSucceeded,
        failed: agreementsFailed,
      },
      issueCharges: {
        processed: issueChargesProcessed,
        succeeded: issueChargesSucceeded,
        failed: issueChargesFailed,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[cron/retry-wave-sync] handler error:', msg);
    return Response.json({ error: 'handler failed', detail: msg }, { status: 500 });
  }
}
