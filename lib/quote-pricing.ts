// lib/quote-pricing.ts
//
// Pure pricing helpers for the NewQuoteModal quote builder. Extracted so the
// "quoted line total" computation is shared between the live form preview,
// the bundle-line snapshot, the bundle grand total, and the regression
// tests — instead of being re-derived in three places (which is how the
// bundle lines ended up showing the rack price instead of the custom price).

export interface QuoteLinePricing {
  /** Rack-derived total before any custom-pricing override (cents). */
  previewCents: number;
  /** Custom TOTAL override in cents, or null when not in 'total' mode. */
  overrideTotalCents: number | null;
  /** Custom PER-UNIT override in cents, or null when not in 'unit' mode. */
  overrideUnitCents: number | null;
  /** Rack quantity the per-unit override multiplies against (months/sends/weeks). */
  rackQty: number;
}

/**
 * Effective (quoted) total for a single quote line after applying the
 * custom-pricing override. Mirrors the NewQuoteModal `effectiveCents` memo:
 *   - overrideTotalCents wins (replaces the rack total)
 *   - else overrideUnitCents × rackQty (per-week / per-month / per-send)
 *   - else the rack previewCents (no override / "Rack rate" mode)
 *
 * This is what a bundle line should snapshot as its subtotal, what the
 * bundle grand total should sum, and what the review overlay should display
 * per line — NOT previewCents, which ignores the custom pricing entirely.
 */
export function quoteLineSubtotalCents(p: QuoteLinePricing): number {
  if (p.overrideTotalCents != null) return p.overrideTotalCents;
  if (p.overrideUnitCents != null) {
    return p.overrideUnitCents * Math.max(1, p.rackQty);
  }
  return p.previewCents;
}
