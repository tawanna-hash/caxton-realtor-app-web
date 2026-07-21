// Regression tests for the New Quote modal's bundle pricing math.
//
// Bug (2026-07): custom per-week/total pricing did not flow into a selected
// or bundled line — the bundle list, "current selection" line, and grand
// total all showed the rack price, so the rep couldn't change pricing on a
// selected package. Root cause: bundle-line subtotals + the current-selection
// display used `previewCents` (rack) instead of `effectiveCents` (post-override).
//
// These assert the pure helpers the modal now delegates to. Pure-logic only —
// no page/server needed (run with PLAYWRIGHT_NO_SERVER=1).

import { test, expect } from '@playwright/test';
import {
  resolveEffectiveCents,
  bundleGrandTotalCents,
  discountPct,
} from '../../lib/quote-bundle';

test.describe('quote bundle pricing', () => {
  test('per-unit override recalculates the line (screenshot scenario: $150/wk × 4)', () => {
    // Rack: Newsletter Banner, weekly, 4 weeks, 1 market = $1000 ($250/wk).
    // Rep overrides per-week to $150 → $600 total.
    const effective = resolveEffectiveCents({
      previewCents: 100000,
      overrideTotalCents: null,
      overrideUnitCents: 15000,
      rackQty: 4,
    });
    expect(effective).toBe(60000);
  });

  test('total override wins and ignores rack + qty', () => {
    expect(
      resolveEffectiveCents({
        previewCents: 100000,
        overrideTotalCents: 72500,
        overrideUnitCents: null,
        rackQty: 4,
      }),
    ).toBe(72500);
  });

  test('no override falls back to rack price', () => {
    expect(
      resolveEffectiveCents({
        previewCents: 100000,
        overrideTotalCents: null,
        overrideUnitCents: null,
        rackQty: 4,
      }),
    ).toBe(100000);
  });

  test('grand total sums effective line subtotals + current effective line', () => {
    // Two saved lines at their overridden prices + a current overridden line.
    expect(bundleGrandTotalCents([60000, 30000], 60000)).toBe(150000);
  });

  test('regression: overridden lines must not sum to the rack grand total', () => {
    // Screenshot bug produced $2000 (rack $1000 line + rack $1000 current).
    // With the fix both are the effective $600, so the grand total is $1200.
    const line1Effective = resolveEffectiveCents({
      previewCents: 100000,
      overrideTotalCents: null,
      overrideUnitCents: 15000,
      rackQty: 4,
    });
    const currentEffective = resolveEffectiveCents({
      previewCents: 100000,
      overrideTotalCents: null,
      overrideUnitCents: 15000,
      rackQty: 4,
    });
    const grand = bundleGrandTotalCents([line1Effective], currentEffective);
    expect(grand).toBe(120000);
    expect(grand).not.toBe(200000);
  });

  test('discountPct reflects the override vs rack (40% off)', () => {
    expect(discountPct(100000, 60000)).toBe(40);
  });

  test('discountPct is negative for an upcharge and 0 with no rack basis', () => {
    expect(discountPct(100000, 120000)).toBe(-20);
    expect(discountPct(0, 5000)).toBe(0);
  });
});
