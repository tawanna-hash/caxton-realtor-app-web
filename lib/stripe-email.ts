// Stripe rejects a Checkout Session outright when customer_email is not a single
// valid address (for example "a@x.com, b@x.com" or a stray note in the field).
// That surfaced to clients as a pay link that "doesn't work". Pass only a clean
// first address, or nothing, and let Stripe collect the email on its own page.
const SIMPLE_EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function stripeSafeEmail(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  for (const part of raw.split(/[,;\s]+/)) {
    const candidate = part.trim().replace(/^<|>$/g, '');
    if (SIMPLE_EMAIL.test(candidate) && candidate.length <= 254) return candidate;
  }
  return undefined;
}
