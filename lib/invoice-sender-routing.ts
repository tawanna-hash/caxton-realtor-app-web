// lib/invoice-sender-routing.ts
//
// Which "From" address does a partner-facing invoice email go out as?
//
// Caxton runs two verified sending domains, each in its own Resend team
// (see getResendApiKeyForFrom in lib/email-sender.ts):
//   - myrealtyline.com  → every RealtyLine market (Austin, Houston, Dallas/FTW)
//   - newslinesa.com    → Newsline San Antonio
//
// So routing cannot be done with theme.fromEmailDisplayName alone (the pattern
// used by the advertiser report emails): the actual address — and therefore the
// API key — has to change per publication.
//
// Multi-publication advertisers: `advertisers.publication` is a CSV of
// PublicationKey values (e.g. 'austin,san_antonio'). We resolve with the same
// priority order getPublicationTheme() uses, i.e. San Antonio wins: if
// 'san_antonio' appears anywhere in the parsed list the email is sent from
// newslinesa.com, otherwise from myrealtyline.com. Unknown / empty / null
// publication values fall through parsePublications() to ['austin'] and
// therefore to myrealtyline.com, which matches the majority of partners.

import { parsePublications, type PublicationKey } from '@/lib/publication-theme';
import type { EmailSenderAddress } from '@/lib/email-sender';

/** All RealtyLine markets (Austin, Houston, Dallas/FTW) share this sender. */
export const REALTYLINE_INVOICE_SENDER: EmailSenderAddress = 'tawanna@myrealtyline.com';
/** Newsline San Antonio sender — different domain, different Resend key. */
export const NEWSLINE_SA_INVOICE_SENDER: EmailSenderAddress = 'tawanna@newslinesa.com';

/**
 * Map an `advertisers.publication` value (single key or CSV) to the verified
 * From address that partner-facing invoice email must be sent from.
 * Never throws — any unrecognized input defaults to the RealtyLine sender.
 */
export function senderAddressForPublication(
  pub: PublicationKey | string | null | undefined,
): EmailSenderAddress {
  const publications = parsePublications(typeof pub === 'string' ? pub : null);
  return publications.includes('san_antonio')
    ? NEWSLINE_SA_INVOICE_SENDER
    : REALTYLINE_INVOICE_SENDER;
}
