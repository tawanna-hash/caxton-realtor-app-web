// lib/recurrence.ts
//
// Pure scheduling math for recurring marketing outreach. No I/O — kept
// dependency-free so it can be unit-tested in isolation and reused by the
// dispatcher (app/api/cron/marketing-sends) and the composer preview.
//
// A recurring "parent" outreach fires every `intervalDays` starting at its
// `next_run_at`. After each fire the parent advances by one interval. When the
// advanced fire time would fall after the inclusive `until` bound, the parent
// is considered complete and stops firing.

export interface RecurrenceState {
  /** The fire time currently pending on the parent. */
  nextRunAt: Date;
  /** Positive integer — fire cadence in days. */
  intervalDays: number;
  /** Inclusive stop date. null = never auto-stops. */
  until: Date | null;
}

export interface RecurrenceAdvance {
  /** The next fire time, or null once the schedule is exhausted. */
  nextRunAt: Date | null;
  /** Parent status after this fire. */
  status: 'scheduled' | 'completed';
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Advance a recurring parent by exactly one interval after a fire.
 *
 * Returns the new `next_run_at` and the resulting parent status. When the
 * advanced time is after the (inclusive) `until` bound, the schedule is
 * exhausted: status becomes 'completed' and nextRunAt is null (the dispatcher
 * clears the column).
 */
export function advanceRecurrence(state: RecurrenceState): RecurrenceAdvance {
  if (!Number.isInteger(state.intervalDays) || state.intervalDays < 1) {
    throw new Error(`invalid recurrence intervalDays: ${state.intervalDays}`);
  }
  const advanced = new Date(state.nextRunAt.getTime() + state.intervalDays * DAY_MS);
  if (state.until && advanced.getTime() > state.until.getTime()) {
    return { nextRunAt: null, status: 'completed' };
  }
  return { nextRunAt: advanced, status: 'scheduled' };
}

/**
 * Preview the next `count` fire timestamps for a recurring schedule, starting
 * at (and including) `firstRunAt`. Stops early when the `until` bound is
 * crossed. Used by the composer to show the marketer the upcoming sends.
 */
export function previewFireTimes(
  firstRunAt: Date,
  intervalDays: number,
  until: Date | null,
  count = 5,
): Date[] {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) return [];
  const out: Date[] = [];
  let cursor = new Date(firstRunAt.getTime());
  for (let i = 0; i < count; i++) {
    if (until && cursor.getTime() > until.getTime()) break;
    out.push(new Date(cursor.getTime()));
    cursor = new Date(cursor.getTime() + intervalDays * DAY_MS);
  }
  return out;
}
