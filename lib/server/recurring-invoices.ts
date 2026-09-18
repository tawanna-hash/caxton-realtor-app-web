// lib/server/recurring-invoices.ts
//
// Recurring invoice generation engine. Called by the daily cron
// (app/api/cron/recurring-invoices/route.ts) and can also be invoked
// on-demand from the admin UI ("Generate now").

import type { PoolClient } from '@neondatabase/serverless';
import { getSql } from '@/lib/db';
import { formatInvoiceNumber, type InvoiceLineItem } from '@/lib/invoices';
import {
  computeNextRun,
  isScheduleExhausted,
  type RecurringFrequency,
} from '@/lib/recurring-invoices';
import { ensurePublicationColumn } from '@/lib/publication-theme';
import { withNeonTransaction } from '@/lib/server/db/neon';
import { nextDocumentNumber } from '@/lib/server/invoice-lifecycle';
import { sendInvoiceEmail, type InvoiceEmailStatus } from '@/lib/server/invoice-email';
import { revalidateInvoiceViews } from '@/lib/server/revalidate-invoice-views';

type Sql = ReturnType<typeof getSql>;

interface DueScheduleRow {
  id: string;
  advertiser_id: number;
  agreement_id: string | null;
  name: string;
  status: string;
  frequency: RecurringFrequency;
  interval_count: number;
  amount_cents: number;
  tax_cents: number;
  line_items: InvoiceLineItem[];
  memo: string | null;
  note_to_client: string | null;
  statement_memo: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  auto_send: boolean;
  due_days: number;
  create_days_in_advance: number;
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_generated: number;
  next_run_at: string;
}

export interface GenerationResult {
  schedule_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  skipped_reason?: string;
  /** Outcome of the auto_send email; absent when the schedule is not auto_send. */
  email_status?: InvoiceEmailStatus;
  email_error?: string;
}

/**
 * Read `advertisers.publication` for the schedule's advertiser so the invoice
 * email goes out from the market's verified domain. Runs on the pooled client
 * (outside the generating transaction) and never throws: a missing row or a
 * failed read returns null, which routes to the RealtyLine sender by default.
 */
async function publicationForAdvertiserEmail(advertiserId: number): Promise<string | null> {
  try {
    await ensurePublicationColumn();
    const sql = getSql();
    const rows = (await sql`
      SELECT publication FROM advertisers WHERE id = ${advertiserId}
    `) as unknown as { publication: string | null }[];
    return rows[0]?.publication ?? null;
  } catch (err) {
    console.warn(
      '[recurring-invoices] publication lookup failed for advertiser',
      advertiserId,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Deliver the auto_send invoice email for a freshly generated invoice.
 *
 * Called only AFTER the generating transaction has committed — a Resend call
 * must never live inside a DB transaction/savepoint, because a rollback cannot
 * unsend an email (and would re-send it on retry). Mirrors the non-blocking
 * side-effect idiom in lib/server/invoice-auto-charge.ts: the invoice is
 * already generated, so an email failure is recorded on the result and logged,
 * never thrown.
 *
 * The From address is routed by the advertiser's publication (RealtyLine
 * markets vs Newsline San Antonio) — see lib/invoice-sender-routing.ts.
 */
async function deliverAutoSendEmail(
  schedule: DueScheduleRow,
  result: GenerationResult,
): Promise<void> {
  if (!result.invoice_id || !schedule.auto_send) return;
  try {
    const publication = await publicationForAdvertiserEmail(schedule.advertiser_id);
    const outcome = await sendInvoiceEmail({
      invoiceId: result.invoice_id,
      invoiceNumber: result.invoice_number ?? '',
      advertiserId: schedule.advertiser_id,
      billToName: schedule.bill_to_name,
      billToEmail: schedule.bill_to_email,
      balanceCents: schedule.amount_cents + schedule.tax_cents,
      publication,
      createdBy: 'recurring-schedule',
    });
    result.email_status = outcome.status;
    if (outcome.error) result.email_error = outcome.error;
    if (outcome.status === 'failed') {
      console.error(
        '[recurring-invoices] email send failed for',
        result.invoice_id,
        outcome.error ?? '',
      );
    } else if (outcome.status !== 'sent') {
      console.warn(
        '[recurring-invoices] email not sent for',
        result.invoice_id,
        outcome.status,
      );
    }
  } catch (err) {
    result.email_status = 'failed';
    result.email_error = err instanceof Error ? err.message : 'unknown email error';
    console.error('[recurring-invoices] email send failed for', result.invoice_id, err);
  }
}

const SCHEDULE_COLUMNS = `
  id, advertiser_id, agreement_id, name, status, frequency, interval_count,
  amount_cents, tax_cents, line_items, memo, note_to_client, statement_memo,
  bill_to_name, bill_to_email, bill_to_address,
  auto_send, due_days, create_days_in_advance, end_date, max_occurrences,
  occurrences_generated, next_run_at
`;

async function resolvePublicationForAdvertiser(
  client: PoolClient,
  advertiserId: number,
): Promise<string> {
  const result = await client.query<{ publication: string | null }>(
    'SELECT publication FROM advertisers WHERE id = $1',
    [advertiserId],
  );
  return result.rows[0]?.publication ?? 'both';
}

/**
 * Claim every currently due schedule for the surrounding transaction.
 * SKIP LOCKED lets overlapping sweeps divide the work instead of generating
 * the same occurrence twice.
 */
export async function findDueSchedules(
  client: PoolClient,
  asOf: Date = new Date(),
): Promise<DueScheduleRow[]> {
  const result = await client.query<DueScheduleRow>(
    `SELECT ${SCHEDULE_COLUMNS}
       FROM recurring_invoice_schedules
      WHERE status = 'active'
        AND next_run_at - (create_days_in_advance * INTERVAL '1 day') <= $1
      ORDER BY next_run_at ASC
      FOR UPDATE SKIP LOCKED`,
    [asOf.toISOString()],
  );
  return result.rows;
}

async function seedRecurringNumberSeries(
  client: PoolClient,
  series: string,
  publication: string,
  year: number,
): Promise<void> {
  const prefix = formatInvoiceNumber(publication, year, 0).replace(/0{4}$/, '');
  await client.query(
    `INSERT INTO document_number_counters (series, next_value)
     SELECT $1,
            COALESCE(MAX(substring(number from '([0-9]+)$')::integer), 0) + 1
       FROM invoices
      WHERE number LIKE $2
     ON CONFLICT (series) DO NOTHING`,
    [series, `${prefix}%`],
  );
}

/** Generate one invoice and advance its schedule using an already locked row. */
async function generateWithClient(
  client: PoolClient,
  schedule: DueScheduleRow,
): Promise<GenerationResult> {
  if (schedule.status !== 'active') {
    return { schedule_id: schedule.id, invoice_id: null, invoice_number: null, skipped_reason: 'not active' };
  }

  const publication = await resolvePublicationForAdvertiser(client, schedule.advertiser_id);
  const year = new Date(schedule.next_run_at).getUTCFullYear();
  const series = `recurring_invoice:${publication}:${year}`;
  await seedRecurringNumberSeries(client, series, publication, year);
  const sequence = await nextDocumentNumber(client, series);
  const number = formatInvoiceNumber(publication, year, sequence);

  const issuedAt = new Date(schedule.next_run_at);
  const dueDate = new Date(issuedAt.getTime() + schedule.due_days * 24 * 60 * 60 * 1000);
  const status = schedule.auto_send ? 'sent' : 'draft';

  const inserted = await client.query<{ id: string; number: string }>(
    `INSERT INTO invoices (
       advertiser_id, agreement_id, number, amount_cents, tax_cents, status,
       issued_at, due_date, bill_to_name, bill_to_email, bill_to_address,
       memo, line_items, created_by, recurring_schedule_id, recurring_occurrence_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb,
       'recurring-schedule', $14, $15
     )
     ON CONFLICT (recurring_schedule_id, recurring_occurrence_at)
       WHERE recurring_schedule_id IS NOT NULL AND recurring_occurrence_at IS NOT NULL
       DO NOTHING
     RETURNING id, number`,
    [
      schedule.advertiser_id,
      schedule.agreement_id,
      number,
      schedule.amount_cents,
      schedule.tax_cents,
      status,
      status === 'sent' ? issuedAt.toISOString() : null,
      dueDate.toISOString().slice(0, 10),
      schedule.bill_to_name,
      schedule.bill_to_email,
      schedule.bill_to_address,
      [schedule.memo, schedule.note_to_client, schedule.statement_memo].filter(Boolean).join('\n\n') || null,
      JSON.stringify(schedule.line_items ?? []),
      schedule.id,
      issuedAt.toISOString(),
    ],
  );
  const invoice = inserted.rows[0];
  if (!invoice) {
    // ON CONFLICT DO NOTHING fired: this exact occurrence was already
    // generated (e.g. by a concurrent sweep that momentarily held a
    // different lock scope, or a manual on-demand generation racing the
    // cron sweep). Do not advance the schedule again — the process that
    // actually inserted the row already did that.
    return { schedule_id: schedule.id, invoice_id: null, invoice_number: null, skipped_reason: 'duplicate occurrence' };
  }

  const nextRun = computeNextRun(issuedAt, schedule.frequency, schedule.interval_count);
  const occurrencesGenerated = schedule.occurrences_generated + 1;
  const exhausted = isScheduleExhausted({
    end_date: schedule.end_date,
    max_occurrences: schedule.max_occurrences,
    occurrences_generated: occurrencesGenerated,
    next_run_at: nextRun.toISOString(),
  });

  await client.query(
    `UPDATE recurring_invoice_schedules
        SET occurrences_generated = $2,
            last_run_at = NOW(),
            next_run_at = $3,
            status = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [schedule.id, occurrencesGenerated, nextRun.toISOString(), exhausted ? 'ended' : 'active'],
  );

  return { schedule_id: schedule.id, invoice_id: invoice.id, invoice_number: invoice.number };
}

/**
 * Generate a schedule occurrence on demand. The legacy tagged-SQL argument is
 * retained for callers, but the write itself uses a real transaction and row
 * lock so it cannot race the cron sweep.
 */
export async function generateInvoiceFromSchedule(
  _sql: Sql,
  schedule: DueScheduleRow,
): Promise<GenerationResult> {
  const { result, claimedSchedule } = await withNeonTransaction(async (client) => {
    const claimed = await client.query<DueScheduleRow>(
      `SELECT ${SCHEDULE_COLUMNS}
         FROM recurring_invoice_schedules
        WHERE id = $1
        FOR UPDATE SKIP LOCKED`,
      [schedule.id],
    );
    const current = claimed.rows[0];
    if (!current) {
      return {
        result: {
          schedule_id: schedule.id,
          invoice_id: null,
          invoice_number: null,
          skipped_reason: 'schedule is locked or no longer exists',
        } satisfies GenerationResult,
        claimedSchedule: null,
      };
    }
    return { result: await generateWithClient(client, current), claimedSchedule: current };
  });
  // Outside the transaction on purpose (see deliverAutoSendEmail).
  if (claimedSchedule) await deliverAutoSendEmail(claimedSchedule, result);
  if (result.invoice_id) revalidateInvoiceViews(result.invoice_id);
  return result;
}

/** Run the full due-schedule sweep. Returns a summary for logging/reporting. */
export async function runRecurringInvoiceSweep(_sql: Sql): Promise<{
  processed: number;
  generated: GenerationResult[];
}> {
  const pendingEmails: { schedule: DueScheduleRow; result: GenerationResult }[] = [];
  const summary = await withNeonTransaction(async (client) => {
    const due = await findDueSchedules(client);
    const generated: GenerationResult[] = [];

    for (let index = 0; index < due.length; index += 1) {
      const schedule = due[index];
      const savepoint = `recurring_schedule_${index}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        const result = await generateWithClient(client, schedule);
        generated.push(result);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        // Queue the email for after COMMIT — never send inside the savepoint.
        if (result.invoice_id && schedule.auto_send) pendingEmails.push({ schedule, result });
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
        console.error('[recurring-invoices] generation failed for schedule', schedule.id, err);
        generated.push({
          schedule_id: schedule.id,
          invoice_id: null,
          invoice_number: null,
          skipped_reason: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }
    return { processed: due.length, generated };
  });

  // Side effects run only after the sweep transaction has committed, so the
  // `generated` entries mutated here are the exact objects in the summary.
  for (const pending of pendingEmails) {
    await deliverAutoSendEmail(pending.schedule, pending.result);
  }

  for (const result of summary.generated) {
    if (result.invoice_id) revalidateInvoiceViews(result.invoice_id);
  }
  return summary;
}
