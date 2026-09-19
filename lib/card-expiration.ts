// lib/card-expiration.ts
//
// Pure helpers for reasoning about `agreements.card_expiration`.
//
// Storage format: the Stripe webhook (app/api/stripe/webhook/route.ts) and the
// SetupIntent confirm route both write `MM/YY` — e.g. `04/28` — built from
// `pm.card.exp_month` / `pm.card.exp_year`. The agreement PDF renders the value
// verbatim ("Card Exp"), and AgreementDrawer's manual input is masked to MM/YY.
// Older / hand-typed rows may however contain `MM/YYYY`, `MMYY`, `MM-YY` or
// junk, so the parser is deliberately lenient and returns null when it cannot
// make sense of the value (callers then treat the card as "unknown", never as
// expired — we must not block a charge on a formatting quirk).
//
// This module is intentionally NOT under lib/server/: both the admin UI
// (InvoiceDrawer / AgreementDrawer) and the server-side auto-charge path need
// the exact same expiry judgement, and everything in here is pure.

export type CardExpirationStatus = 'unknown' | 'valid' | 'expiring_soon' | 'expired';

export type ParsedCardExpiration = {
  /** 1-12 */
  month: number;
  /** Full year, e.g. 2028 */
  year: number;
  /** Normalized MM/YY for display. */
  display: string;
};

/** Default look-ahead window for the "expiring soon" warning. */
export const CARD_EXPIRING_SOON_DAYS = 30;

/**
 * Parse a stored card expiration string. Accepts `MM/YY`, `MM/YYYY`, `MM-YY`,
 * `MM YYYY` and `MMYY`. Two-digit years are expanded into the 2000s.
 */
export function parseCardExpiration(cardExpiration: string | null | undefined): ParsedCardExpiration | null {
  if (!cardExpiration) return null;
  const raw = String(cardExpiration).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  let monthPart: string;
  let yearPart: string;

  const separated = raw.match(/^(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})$/);
  if (separated) {
    monthPart = separated[1];
    yearPart = separated[2];
  } else if (digits.length === 4) {
    // MMYY
    monthPart = digits.slice(0, 2);
    yearPart = digits.slice(2);
  } else if (digits.length === 6) {
    // MMYYYY
    monthPart = digits.slice(0, 2);
    yearPart = digits.slice(2);
  } else {
    return null;
  }

  const month = Number(monthPart);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  const yearNum = Number(yearPart);
  if (!Number.isInteger(yearNum)) return null;
  const year = yearPart.length === 2 ? 2000 + yearNum : yearNum;
  if (year < 2000 || year > 2100) return null;

  return {
    month,
    year,
    display: `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`,
  };
}

/** Normalized `MM/YY` for display, or null when unparseable. */
export function formatCardExpiration(cardExpiration: string | null | undefined): string | null {
  return parseCardExpiration(cardExpiration)?.display ?? null;
}

/**
 * First instant *after* the card's validity window. Cards remain usable through
 * the last day of their printed expiry month, so this is midnight UTC on the
 * first of the following month.
 */
function expiresAfter(parsed: ParsedCardExpiration): number {
  return Date.UTC(parsed.year, parsed.month, 1, 0, 0, 0, 0);
}

/**
 * True when the card's expiry month is already in the past.
 * Unparseable / missing values return false (unknown ≠ expired).
 */
export function isCardExpired(cardExpiration: string | null | undefined, asOf: Date = new Date()): boolean {
  const parsed = parseCardExpiration(cardExpiration);
  if (!parsed) return false;
  return asOf.getTime() >= expiresAfter(parsed);
}

/**
 * True when the card is still valid today but stops being valid within
 * `withinDays` (default 30). Already-expired cards return false — use
 * `isCardExpired` for those so the two states stay mutually exclusive.
 */
export function isCardExpiringSoon(
  cardExpiration: string | null | undefined,
  asOf: Date = new Date(),
  withinDays: number = CARD_EXPIRING_SOON_DAYS,
): boolean {
  const parsed = parseCardExpiration(cardExpiration);
  if (!parsed) return false;
  const end = expiresAfter(parsed);
  const now = asOf.getTime();
  if (now >= end) return false;
  return end - now <= withinDays * 86_400_000;
}

/** Combined status, convenient for badge rendering. */
export function cardExpirationStatus(
  cardExpiration: string | null | undefined,
  asOf: Date = new Date(),
  withinDays: number = CARD_EXPIRING_SOON_DAYS,
): CardExpirationStatus {
  if (!parseCardExpiration(cardExpiration)) return 'unknown';
  if (isCardExpired(cardExpiration, asOf)) return 'expired';
  if (isCardExpiringSoon(cardExpiration, asOf, withinDays)) return 'expiring_soon';
  return 'valid';
}

/** Human warning copy shared by the invoice drawer and agreement drawer. */
export function cardExpirationWarning(
  cardExpiration: string | null | undefined,
  asOf: Date = new Date(),
  withinDays: number = CARD_EXPIRING_SOON_DAYS,
): string | null {
  const parsed = parseCardExpiration(cardExpiration);
  if (!parsed) return null;
  const status = cardExpirationStatus(cardExpiration, asOf, withinDays);
  if (status === 'expired') return `Card on file expires ${parsed.display} — update before charging`;
  if (status === 'expiring_soon') return `Card on file expires ${parsed.display} soon — consider updating`;
  return null;
}

/** Error copy used server-side when an expired card blocks an auto-charge. */
export const EXPIRED_CARD_CHARGE_ERROR =
  'Card on file is expired — update the card before auto-charging.';
