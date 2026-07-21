// Pure pricing helpers for the New Quote modal's bundle (multi-line) builder.
// Extracted so the "custom pricing must flow into the saved/displayed line"
// behavior can be regression-tested without mounting the React component.

export type OverrideMode = 'off' | 'total' | 'unit';

export interface EffectiveCentsInput {
  /** Rack (list-price) total for the current line, before any override. */
  previewCents: number;
  /** Override total in cents, or null when the rep isn't overriding the total. */
  overrideTotalCents: number | null;
  /** Override per-unit price in cents, or null when not overriding per-unit. */
  overrideUnitCents: number | null;
  /** Unit count the per-unit override multiplies by (weeks / months / sends). */
  rackQty: number;
}

/**
 * The price the customer actually pays for a line: the total override wins,
 * then the per-unit override (× qty), otherwise the rack price. This is the
 * figure that must be snapshotted onto a bundle line and shown in the bundle
 * list / grand total — NOT the rack `previewCents`.
 */
export function resolveEffectiveCents({
  previewCents,
  overrideTotalCents,
  overrideUnitCents,
  rackQty,
}: EffectiveCentsInput): number {
  if (overrideTotalCents != null) return overrideTotalCents;
  if (overrideUnitCents != null) return overrideUnitCents * rackQty;
  return previewCents;
}

/**
 * Grand total for a bundle = sum of each saved line's effective subtotal plus
 * the current (not-yet-added) line's effective subtotal.
 */
export function bundleGrandTotalCents(
  lineSubtotalsCents: number[],
  currentLineCents: number,
): number {
  const linesSum = lineSubtotalsCents.reduce((acc, c) => acc + c, 0);
  return linesSum + currentLineCents;
}

/**
 * Discount percentage a line's effective price represents vs. its rack price.
 * Positive = discount, negative = upcharge. One decimal place; 0 when there's
 * no rack basis to compare against.
 */
export function discountPct(previewCents: number, effectiveCents: number): number {
  if (previewCents <= 0) return 0;
  return Math.round(((previewCents - effectiveCents) / previewCents) * 1000) / 10;
}
