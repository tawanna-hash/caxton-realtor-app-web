// lib/server/recurring-invoices.ts
//
// Recurring invoice generation engine. Called by the daily cron
// (app/api/cron/recurring-invoices/route.ts) and can also be invoked
// on-demand from the admin UI ("Generate now").

import { getSql } from '@/lib/db';
import { formatInvoiceNumber, type InvoiceLineItem } from '@/lib/invoices';
import {
  computeNextRun,
  isScheduleExhausted,
  type RecurringFrequency,
} from '@/lib/recurring-invoices';

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
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  auto_send: boolean;
  due_days: number;
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
}

/** Publication used for invoice numbering — read directly from the advertiser record. */
async function resolvePublicationForAdvertiser(sql: Sql, advertiserId: number): Promise<string> {
  try {
    const rows = (await sql`SELECT publication FROM advertisers WHERE id = ${advertiserId}`) as unknown as
      Array<{ publication: string | null }>;
    return rows[0]?.publication ?? 'both';
  } catch {
    return 'both';
  }
}

/** Find every active schedule whose next_run_at has arrived. */
export async function findDueSchedules(sql: Sql, asOf: Date = new Date()): Promise<DueScheduleRow[]> {
  const rows = (await sql`
    SELECT id, advertiser_id, agreement_id, name, status, frequency, interval_count,
           amount_cents, tax_cents, line_items, memo,
           bill_to_name, bill_to_email, bill_to_address,
           auto_send, due_days, end_date, max_occurrences,
           occurrences_generated, next_run_at
    FROM recurring_invoice_schedules
    WHERE status = 'active' AND next_run_at <= ${asOf.toISOString()}
    ORDER BY next_run_at ASC
  `) as unknown as DueScheduleRow[];
  return rows;
}

/**
 * Generate one invoice from a due schedule and advance its next_run_at.
 * Idempotent-ish: intended to run within a per-schedule lock window
 * (the cron processes schedules one at a time), but safe to re-run —
 * worst case is an extra invoice if run twice concurrently for the same
 * schedule, which is an accepted tradeoff of the simple polling design.
 */
export async function generateInvoiceFromSchedule(sql: Sql, schedule: DueScheduleRow): Promise<GenerationResult> {
  if (schedule.status !== 'active') {
    return { schedule_id: schedule.id, invoice_id: null, invoice_number: null, skipped_reason: 'not active' };
  }

  const publication = await resolvePublicationForAdvertiser(sql, schedule.advertiser_id);
  const year = new Date().getFullYear();

  const countRows = (await sql`
    SELECT count(*)::int AS n FROM invoices i
    JOIN advertisers a ON a.id = i.advertiser_id
    WHERE a.publication = ${publication}
      AND EXTRACT(YEAR FROM i.created_at) = ${year}
  `) as unknown as Array<{ n: number }>;
  const seq = (countRows[0]?.n ?? 0) + 1;
  const number = formatInvoiceNumber(publication, year, seq);

  const issuedAt = new Date();
  const dueDate = new Date(issuedAt.getTime() + schedule.due_days * 24 * 60 * 60 * 1000);
  const status = schedule.auto_send ? 'sent' : 'draft';

  const inserted = (await sql`
    INSERT INTO invoices (
      advertiser_id, agreement_id, number, amount_cents, tax_cents, status,
      issued_at, due_date, bill_to_name, bill_to_email, bill_to_address,
      memo, line_items, created_by, recurring_schedule_id
    ) VALUES (
      ${schedule.advertiser_id}, ${schedule.agreement_id}, ${number},
      ${schedule.amount_cents}, ${schedule.tax_cents}, ${status},
      ${status === 'sent' ? issuedAt.toISOString() : null},
      ${dueDate.toISOString().slice(0, 10)},
      ${schedule.bill_to_name}, ${schedule.bill_to_email}, ${schedule.bill_to_address},
      ${schedule.memo}, ${JSON.stringify(schedule.line_items ?? [])}::jsonb,
      'recurring-schedule', ${schedule.id}
    )
    RETURNING id, number
  `) as unknown as Array<{ id: string; number: string }>;

  const invoice = inserted[0];

  const nextRun = computeNextRun(new Date(schedule.next_run_at), schedule.frequency, schedule.interval_count);
  const occurrencesGenerated = schedule.occurrences_generated + 1;
  const exhausted = isScheduleExhausted({
    end_date: schedule.end_date,
    max_occurrences: schedule.max_occurrences,
    occurrences_generated: occurrencesGenerated,
    next_run_at: nextRun.toISOString(),
  });

  await sql`
    UPDATE recurring_invoice_schedules
    SET occurrences_generated = ${occurrencesGenerated},
        last_run_at = NOW(),
        next_run_at = ${nextRun.toISOString()},
        status = ${exhausted ? 'ended' : 'active'},
        updated_at = NOW()
    WHERE id = ${schedule.id}
  `;

  return { schedule_id: schedule.id, invoice_id: invoice.id, invoice_number: invoice.number };
}

/** Run the full due-schedule sweep. Returns a summary for logging/reporting. */
export async function runRecurringInvoiceSweep(sql: Sql): Promise<{
  processed: number;
  generated: GenerationResult[];
}> {
  const due = await findDueSchedules(sql);
  const generated: GenerationResult[] = [];
  for (const schedule of due) {
    try {
      const result = await generateInvoiceFromSchedule(sql, schedule);
      generated.push(result);
    } catch (err) {
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
}
