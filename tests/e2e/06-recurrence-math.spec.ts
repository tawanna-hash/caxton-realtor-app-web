// tests/e2e/06-recurrence-math.spec.ts
//
// Unit coverage for the pure recurrence scheduling math in lib/recurrence.ts.
// No server or DB needed — run with PLAYWRIGHT_NO_SERVER=1. Focuses on the
// interval=4 case used by the "2027 marketing budget" campaign: child fire
// advancement and completion at the inclusive `until` boundary.

import { test, expect } from '@playwright/test';
import { advanceRecurrence, previewFireTimes } from '../../lib/recurrence';

const DAY = 24 * 60 * 60 * 1000;

test('advanceRecurrence advances by exactly one interval', () => {
  const nextRunAt = new Date('2026-07-17T14:00:00.000Z');
  const r = advanceRecurrence({ nextRunAt, intervalDays: 4, until: null });
  expect(r.status).toBe('scheduled');
  expect(r.nextRunAt?.toISOString()).toBe(new Date(nextRunAt.getTime() + 4 * DAY).toISOString());
});

test('advanceRecurrence stays scheduled when the advance lands on or before until', () => {
  const nextRunAt = new Date('2026-10-26T14:00:00.000Z');
  const until = new Date('2026-10-30T14:00:00.000Z'); // exactly one interval later
  const r = advanceRecurrence({ nextRunAt, intervalDays: 4, until });
  expect(r.status).toBe('scheduled');
  expect(r.nextRunAt?.toISOString()).toBe(until.toISOString());
});

test('advanceRecurrence completes when the advance passes until', () => {
  const nextRunAt = new Date('2026-10-30T14:00:00.000Z');
  const until = new Date('2026-10-30T14:00:00.000Z');
  const r = advanceRecurrence({ nextRunAt, intervalDays: 4, until });
  expect(r.status).toBe('completed');
  expect(r.nextRunAt).toBeNull();
});

test('advanceRecurrence rejects a non-positive interval', () => {
  const nextRunAt = new Date('2026-07-17T14:00:00.000Z');
  expect(() => advanceRecurrence({ nextRunAt, intervalDays: 0, until: null })).toThrow();
  expect(() => advanceRecurrence({ nextRunAt, intervalDays: 1.5, until: null })).toThrow();
});

test('previewFireTimes yields the every-4-days cadence from Jul 17 through Oct 30', () => {
  const first = new Date('2026-07-17T14:00:00.000Z');
  const until = new Date('2026-10-30T23:59:59.000Z');
  // Full run: ~27 fires across the window. Ask for all of them.
  const fires = previewFireTimes(first, 4, until, 100);
  expect(fires[0].toISOString()).toBe(first.toISOString());
  // Cadence: each fire is 4 days after the prior.
  for (let i = 1; i < fires.length; i++) {
    expect(fires[i].getTime() - fires[i - 1].getTime()).toBe(4 * DAY);
  }
  // Never past the bound.
  expect(fires[fires.length - 1].getTime()).toBeLessThanOrEqual(until.getTime());
});

test('previewFireTimes caps at the requested count', () => {
  const first = new Date('2026-07-17T14:00:00.000Z');
  const fires = previewFireTimes(first, 4, null, 5);
  expect(fires).toHaveLength(5);
  expect(fires[4].toISOString()).toBe(new Date(first.getTime() + 16 * DAY).toISOString());
});
