// lib/format-phone.ts
//
// Canonical US phone formatting helpers, shared across the admin so every
// phone and mobile field renders the same way: "(000) 000-0000".
//
// - formatPhone:      use for display (tables, drawers, cards). Returns the
//                     formatted string, or '' if the input has no digits.
// - formatPhoneInput: use as an onChange normalizer for <input> fields so
//                     users see the parens/space/dash as they type. Always
//                     caps at 10 digits and silently drops a leading "1".
// - phoneDigits:      strip everything except 0-9 (useful when sending the
//                     value back to the database or for dedupe keys).

const LEAD_ONE = /^1(?=\d{10}$)/;

/** Return only the digit characters of `s`. */
export function phoneDigits(s: string | null | undefined): string {
  if (!s) return '';
  return String(s).replace(/\D/g, '');
}

/**
 * Format any string containing a US phone number as "(000) 000-0000".
 *
 * - Strips non-digit characters first.
 * - Drops a leading country-code "1" when the result would otherwise be 11
 *   digits (e.g. "1-832-517-3754" -> "(832) 517-3754").
 * - Returns partial formats while a user types, so this same function can
 *   be used for both display and live input formatting.
 * - Returns '' for null / undefined / empty / digit-less input.
 */
export function formatPhone(s: string | null | undefined): string {
  if (s == null) return '';
  let d = phoneDigits(s);
  if (!d) return '';
  // Strip a leading "1" country code on 11-digit inputs.
  d = d.replace(LEAD_ONE, '');
  d = d.slice(0, 10);
  if (d.length <= 3)  return `(${d}`;
  if (d.length <= 6)  return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/**
 * Same as formatPhone but tuned for use inside an <input> onChange handler:
 * an empty string stays empty so users can clear the field without seeing
 * a stray "(". For display, prefer formatPhone.
 */
export function formatPhoneInput(s: string | null | undefined): string {
  if (s == null) return '';
  const d = phoneDigits(s);
  if (!d) return '';
  return formatPhone(d);
}
