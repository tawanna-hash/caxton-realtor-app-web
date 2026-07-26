// lib/scrapers/promotion-utils.ts
//
// Shared utilities for promotion scrapers.

/**
 * Check if a promotion's expiration date has passed.
 * Returns false if no expiration date is set (no expiry = not expired).
 * Compares end-of-day to avoid timezone edge cases.
 */
export function isPromotionExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + 'T23:59:59');
  return expiry < today;
}
