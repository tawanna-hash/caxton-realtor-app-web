// lib/ad-channels.ts
//
// Channel taxonomy for the ad-management funnel.
//
//   • PRINT   — Brand [1/3/6/12/12 Plus] packages, sold by issue/duration.
//   • DIGITAL — APP_AD_SLOTS (the 17 on-site placements), sold by week/month.
//   • EMAIL   — e-Blast packages (Solo, Weekly inclusion), sold by send.
//
// Every inquiry, agreement, and campaign carries this tag so admin
// inboxes, pipeline views, and reporting can slice by channel. Keep
// this file as the single source — UI labels, badges, and routing all
// import from here.

export type AdChannel = 'print' | 'digital' | 'email';

export const AD_CHANNELS: readonly AdChannel[] = ['print', 'digital', 'email'] as const;

export const AD_CHANNEL_LABEL: Record<AdChannel, string> = {
  print: 'Print',
  digital: 'Digital',
  email: 'Email',
};

export const AD_CHANNEL_DESCRIPTION: Record<AdChannel, string> = {
  print:
    'Full-page, half-page, or quarter-page ad in the monthly print + digital-replica edition.',
  digital:
    'On-site placements across realtynewsnow.app: feed banners, article slots, calendar sponsorships, push, etc.',
  email:
    'Solo or weekly e-Blast to RealtyLine and/or Newsline subscribers.',
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
  // Everything else in the catalog is a digital app-slot slug.
  return 'digital';
}

export function isAdChannel(v: unknown): v is AdChannel {
  return v === 'print' || v === 'digital' || v === 'email';
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
  if (type === 'eblast') return 'email';
  return 'digital';
}
