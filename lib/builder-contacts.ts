// lib/builder-contacts.ts
//
// Per-builder sales-team contact for listing inquiries.
//
// When a builder has an email here, /api/listing-inquiry forwards the lead
// to that address and CCs the default RNN inbox so nothing is ever lost.
// Builders without an entry fall back to the default inbox (Tawanna).
//
// Add/verify entries as sales-team emails are confirmed. Keys are matched
// case-insensitively against inventory row.builderName.

export const DEFAULT_INQUIRY_TO =
  process.env.LISTING_INQUIRY_TO ?? 'tawanna@myrealtyline.com';

// builderName -> sales-team email. Leave an entry out (or null) to use the
// default inbox. Populate as emails are confirmed.
export const BUILDER_SALES_EMAILS: Record<string, string> = {
  // 'Newmark Homes': 'sales@newmarkhomes.com',
  // 'M/I Homes': 'sales@mihomes.com',
};

export function getBuilderSalesEmail(builderName: string | null | undefined): string | null {
  const key = builderName?.trim();
  if (!key) return null;
  const exact = BUILDER_SALES_EMAILS[key];
  if (exact) return exact;
  const found = Object.entries(BUILDER_SALES_EMAILS).find(
    ([k]) => k.toLowerCase() === key.toLowerCase(),
  );
  return found ? found[1] : null;
}
