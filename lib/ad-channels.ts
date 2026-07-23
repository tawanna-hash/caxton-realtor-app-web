// lib/ad-channels.ts
//
// Channel taxonomy for the ad-management funnel.
//
//   • PRINT   — Brand [1/3/6/12/12 Plus] packages, sold by issue/duration.
//   • DIGITAL — On-site web placements across realtynewsnow.app, sold by week/month.
//   • EMAIL   — e-Blast packages (Solo, Weekly inclusion), sold by send.
//   • APP     — In-app placements inside the iOS / Android RealtyLine + Newsline apps.
//
// Every inquiry, agreement, and campaign carries this tag so admin
// inboxes, pipeline views, and reporting can slice by channel. Keep
// this file as the single source — UI labels, badges, and routing all
// import from here.

export type AdChannel = 'print' | 'digital' | 'email' | 'app';

export const AD_CHANNELS: readonly AdChannel[] = ['print', 'digital', 'email', 'app'] as const;

export const AD_CHANNEL_LABEL: Record<AdChannel, string> = {
  print: 'Print',
  digital: 'Digital',
  email: 'Email',
  app: 'App',
};

export const AD_CHANNEL_DESCRIPTION: Record<AdChannel, string> = {
  print:
    'Full-page, half-page, or quarter-page ad in the monthly print + digital-replica edition.',
  digital:
    'On-site placements across realtynewsnow.app: feed banners, article slots, calendar sponsorships, etc.',
  email:
    'Solo or weekly e-Blast to RealtyLine and/or Newsline San Antonio subscribers.',
  app:
    'In-app placements inside the iOS and Android RealtyLine + Newsline apps (splash, feed, article, calendar).',
};

/**
 * Default channel for a given slot slug or package id. Used to backfill
 * `channel` on existing rows and to derive a sensible default in flows
 * where the buyer hasn't picked one explicitly.
 */
export function deriveChannelFromSlot(
  slotOrPackageId: string | null | undefined,
): AdChannel | null {
  if (!slotOrPackageId) return null;
  const v = slotOrPackageId.toLowerCase();
  if (v.startsWith('brand')) return 'print';
  if (v.startsWith('eblast') || v.startsWith('e-blast')) return 'email';
  if (v.startsWith('app-') || v.startsWith('app_')) return 'app';
  // Everything else is an on-site (web) digital placement.
  return 'digital';
}

export function isAdChannel(v: unknown): v is AdChannel {
  return v === 'print' || v === 'digital' || v === 'email' || v === 'app';
}

/**
 * Map an agreement's `type` (print_ad / eblast / sponsored_content /
 * package / other) to the funnel `channel` tag used everywhere else.
 * Print ads → print, eblasts → email, everything else → digital.
 */
export function deriveChannelFromAgreementType(
  type: string | null | undefined,
): AdChannel {
  if (type === 'print_ad') return 'print';
  if (type === 'package') return 'print';
  if (type === 'eblast') return 'email';
  if (type === 'app_ad') return 'app';
  return 'digital';
}

/**
 * Derive the funnel channel for an agreement from its line items' channels.
 * Mirrors the Sign Wizard: a bundle is 'print' only when EVERY line is
 * print; otherwise the first non-print line's channel wins (fallback
 * 'digital'). Agreements with no line items fall back to the type column —
 * so a single-line print_ad still resolves to print. This keeps a mixed /
 * non-print bundle (e.g. app Top Banner + e-Blast, parent type 'package')
 * from being misread as print just because deriveChannelFromAgreementType
 * maps 'package' -> print.
 */
export function deriveChannelFromLineItems(
  lineChannels: readonly (string | null | undefined)[] | null | undefined,
  type: string | null | undefined,
): AdChannel {
  if (!lineChannels || lineChannels.length === 0) {
    return deriveChannelFromAgreementType(type);
  }
  if (lineChannels.every((c) => c === 'print')) return 'print';
  const firstNonPrint = lineChannels.find((c) => isAdChannel(c) && c !== 'print');
  return (firstNonPrint as AdChannel | undefined) ?? 'digital';
}
