// lib/recurring-invoices.ts
//
// Types + helpers for the `recurring_invoice_schedules` table. Pattern
// mirrors `lib/invoices.ts` / `lib/agreements.ts`.

import type { InvoiceLineItem } from './invoices';

export type RecurringScheduleStatus = 'active' | 'paused' | 'ended';
export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annually';
export type RecurringScheduleSource = 'standalone' | 'agreement';

export interface RecurringInvoiceSchedule {
  id: string;
  advertiser_id: number;
  agreement_id: string | null;
  name: string;
  status: RecurringScheduleStatus;
  frequency: RecurringFrequency;
  interval_count: number;
  day_of_month: number | null;
  amount_cents: number;
  tax_cents: number;
  line_items: InvoiceLineItem[];
  memo: string | null;
  bill_to_name: string | null;
  bill_to_email: string | null;
  bill_to_address: string | null;
  auto_send: boolean;
  due_days: number;
  start_date: string;
  end_date: string | null;
  max_occurrences: number | null;
  occurrences_generated: number;
  next_run_at: string;
  last_run_at: string | null;
  source: RecurringScheduleSource;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecurringScheduleWithAdvertiser extends RecurringInvoiceSchedule {
  advertiser_name: string | null;
}

export const RECURRING_SCHEDULE_PATCHABLE_FIELDS = [
  'name', 'status',
  'frequency', 'interval_count', 'day_of_month',
  'amount_cents', 'tax_cents', 'line_items', 'memo',
  'bill_to_name', 'bill_to_email', 'bill_to_address',
  'auto_send', 'due_days',
  'end_date', 'max_occurrences',
  'next_run_at',
] as const;

export const RECURRING_SCHEDULE_STATUS_VALUES = new Set<RecurringScheduleStatus>([
  'active', 'paused', 'ended',
]);
export const RECURRING_FREQUENCY_VALUES = new Set<RecurringFrequency>([
  'weekly', 'biweekly', 'monthly', 'quarterly', 'annually',
]);

/**
 * Compute the next run timestamp after `from`, given a frequency and
 * interval count. Keeps the same time-of-day as `from`.
 */
export function computeNextRun(
  from: Date,
  frequency: RecurringFrequency,
  intervalCount: number,
): Date {
  const n = Math.max(1, intervalCount | 0);
  const next = new Date(from.getTime());
  switch (frequency) {
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7 * n);
      break;
    case 'biweekly':
      next.setUTCDate(next.getUTCDate() + 14 * n);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1 * n);
      break;
    case 'quarterly':
      next.setUTCMonth(next.getUTCMonth() + 3 * n);
      break;
    case 'annually':
      next.setUTCFullYear(next.getUTCFullYear() + 1 * n);
      break;
  }
  return next;
}

/** True when a schedule has hit its end_date or max_occurrences cap. */
export function isScheduleExhausted(
  schedule: Pick<RecurringInvoiceSchedule, 'end_date' | 'max_occurrences' | 'occurrences_generated' | 'next_run_at'>,
): boolean {
  if (schedule.max_occurrences != null && schedule.occurrences_generated >= schedule.max_occurrences) {
    return true;
  }
  if (schedule.end_date) {
    const end = new Date(schedule.end_date + 'T23:59:59Z');
    const next = new Date(schedule.next_run_at);
    if (next > end) return true;
  }
  return false;
}

export function frequencyLabel(freq: RecurringFrequency): string {
  switch (freq) {
    case 'weekly': return 'Weekly';
    case 'biweekly': return 'Every 2 weeks';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'annually': return 'Annually';
  }
}
