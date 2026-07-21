// tests/e2e/06-quote-pricing.spec.ts
//
// Regression guard for the NewQuoteModal custom-pricing / bundle bug:
// bundle lines were snapshotting the RACK total (previewCents) instead of
// the QUOTED total (effectiveCents), so a custom per-week price never showed
// up on bundle line #1 or the "current selection" row.
//
// This is a pure-function spec (no browser, no server) — it pins the
// quoteLineSubtotalCents helper that the modal now uses for the bundle-line
// subtotal, the bundle grand total, and the current-selection preview.
//
// Run without a dev server:
//   PLAYWRIGHT_NO_SERVER=1 npx playwright test tests/e2e/06-quote-pricing.spec.ts

import { test, expect } from '@playwright/test';
import { quoteLineSubtotalCents } from '../../lib/quote-pricing';

test.describe('quoteLineSubtotalCents — custom pricing on bundle lines', () => {
  test('rack mode returns the rack preview', () => {
    // App ad, Newsletter Banner, weekly, 4 weeks @ $250/wk = $1000 rack.
    expect(
      quoteLineSubtotalCents({
        previewCents: 100_000,
        overrideTotalCents: null,
        overrideUnitCents: null,
        rackQty: 4,
      }),
    ).toBe(100_000);
  });

  test('per-unit override multiplies by rack qty (reported bug scenario)', () => {
    // The exact reported case: 4 weeks, custom $150/week → $600 quoted,
    // NOT the $1000 rack price the bundle lines were stuck on.
    expect(
      quoteLineSubtotalCents({
        previewCents: 100_000,
        overrideTotalCents: null,
        overrideUnitCents: 15_000,
        rackQty: 4,
      }),
    ).toBe(60_000);
  });

  test('per-unit override for 1 week', () => {
    expect(
      quoteLineSubtotalCents({
        previewCents: 25_000,
        overrideTotalCents: null,
        overrideUnitCents: 15_000,
        rackQty: 1,
      }),
    ).toBe(15_000);
  });

  test('total override replaces the rack total', () => {
    expect(
      quoteLineSubtotalCents({
        previewCents: 100_000,
        overrideTotalCents: 54_000,
        overrideUnitCents: null,
        rackQty: 4,
      }),
    ).toBe(54_000);
  });

  test('total override wins over a per-unit override when both supplied', () => {
    // Mirrors effectiveCents: overrideTotalCents takes precedence.
    expect(
      quoteLineSubtotalCents({
        previewCents: 100_000,
        overrideTotalCents: 50_000,
        overrideUnitCents: 15_000,
        rackQty: 4,
      }),
    ).toBe(50_000);
  });

  test('zero rack qty is clamped to 1 for per-unit math', () => {
    expect(
      quoteLineSubtotalCents({
        previewCents: 0,
        overrideTotalCents: null,
        overrideUnitCents: 15_000,
        rackQty: 0,
      }),
    ).toBe(15_000);
  });

  test('monthly app cadence: per-unit override × months', () => {
    // App ad, monthly, 6 months, rack $200/mo = $1200; custom $150/mo → $900.
    expect(
      quoteLineSubtotalCents({
        previewCents: 120_000,
        overrideTotalCents: null,
        overrideUnitCents: 15_000,
        rackQty: 6,
      }),
    ).toBe(90_000);
  });
});
