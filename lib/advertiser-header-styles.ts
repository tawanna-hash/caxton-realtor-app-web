// lib/advertiser-header-styles.ts
//
// The set of header layouts an admin can pick for an advertiser's
// public detail page. Add new options here and they automatically
// show up in the admin modal dropdown and the public renderer.
//
// Defaults to 'current' so existing rows continue to look the same.

export const ADVERTISER_HEADER_STYLES = [
  'current',
  'borderless',
  'banner',
  'chip',
  'tint',
  'centered',
] as const;

export type AdvertiserHeaderStyle = (typeof ADVERTISER_HEADER_STYLES)[number];

const DEFAULT_HEADER_STYLE: AdvertiserHeaderStyle = 'current';

function isAdvertiserHeaderStyle(v: unknown): v is AdvertiserHeaderStyle {
  return typeof v === 'string' && (ADVERTISER_HEADER_STYLES as readonly string[]).includes(v);
}

export function coerceHeaderStyle(v: unknown): AdvertiserHeaderStyle {
  return isAdvertiserHeaderStyle(v) ? v : DEFAULT_HEADER_STYLE;
}

/**
 * Human-readable label + one-line description shown in the admin
 * dropdown. Keep these short - the dropdown is narrow.
 */
export const HEADER_STYLE_META: Record<
  AdvertiserHeaderStyle,
  { label: string; blurb: string }
> = {
  current: {
    label: 'Current (classic tile)',
    blurb: 'Square light-gray tile with thin border. Default.',
  },
  borderless: {
    label: 'Borderless on white',
    blurb: 'Soft drop shadow, rounded corners, no border.',
  },
  banner: {
    label: 'Brand banner',
    blurb: 'Logo centered on a tinted strip above the name.',
  },
  chip: {
    label: 'Inline brand chip',
    blurb: 'Pill with logo and name. Tagline becomes the headline.',
  },
  tint: {
    label: 'Soft tinted tile',
    blurb: 'Larger rounded tile with accent-tinted background.',
  },
  centered: {
    label: 'Centered editorial',
    blurb: 'Logo, name and tagline stacked and centered. No frame.',
  },
};
