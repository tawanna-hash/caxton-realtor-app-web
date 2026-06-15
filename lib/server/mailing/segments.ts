// lib/server/mailing/segments.ts
//
// Canonical mailing-segment enum + slug helpers.

// ============================================================

export type MailingSegment =
  | 'manual-newsline'
  | 'realtor'
  | 'active-advertiser-atx'
  | 'active-advertiser-sa'
  | 'non-advertiser-atx'
  | 'non-advertiser-sa';

export const SEGMENTS: { segment: MailingSegment; slug: string; label: string; caption: string; accent: string }[] = [
  {
    segment: 'active-advertiser-atx',
    slug:    'active-advertisers-atx',
    label:   'Active Advertisers - RealtyLine ATX',
    caption: 'Currently-active RealtyLine ATX advertisers and their staff.',
    accent:  '#2563EB',
  },
  {
    segment: 'active-advertiser-sa',
    slug:    'active-advertisers-sa',
    label:   'Active Advertisers - Newsline SA',
    caption: 'Currently-active Newsline SA advertisers and their staff.',
    accent:  '#0EA5E9',
  },
  {
    segment: 'non-advertiser-atx',
    slug:    'non-advertisers-atx',
    label:   'Non-Advertisers - RealtyLine ATX',
    caption: 'RealtyLine ATX prospects who haven’t run an ad yet.',
    accent:  '#F59E0B',
  },
  {
    segment: 'non-advertiser-sa',
    slug:    'non-advertisers-sa',
    label:   'Non-Advertisers - Newsline SA',
    caption: 'Newsline SA prospects who haven’t run an ad yet.',
    accent:  '#EA580C',
  },
  {
    segment: 'manual-newsline',
    slug:    'manual-newsline-contacts',
    label:   'Manual Newsline Contacts',
    caption: 'Newsline contacts entered or imported manually.',
    accent:  '#10B981',
  },
  {
    segment: 'realtor',
    slug:    'realtors',
    label:   'REALTORS',
    caption: 'Licensed real estate agents — your core audience.',
    accent:  '#3D0740',
  },
];

export function segmentFromSlug(slug: string): MailingSegment | null {
  const m = SEGMENTS.find((s) => s.slug === slug);
  if (m) return m.segment;
  // Back-compat: old slug 'advertisers' → new segment 'manual-newsline'.
  if (slug === 'advertisers') return 'manual-newsline';
  // Back-compat for legacy segment slugs prior to the per-publication split:
  //   /admin/mailing/active-advertisers → ATX variant
  //   /admin/mailing/non-advertisers    → ATX variant
  if (slug === 'active-advertisers') return 'active-advertiser-atx';
  if (slug === 'non-advertisers') return 'non-advertiser-atx';
  return null;
}

export function slugFromSegment(seg: MailingSegment): string {
  return SEGMENTS.find((s) => s.segment === seg)?.slug ?? seg;
}

export function isMailingSegment(v: unknown): v is MailingSegment {
  return (
    v === 'manual-newsline' ||
    v === 'realtor' ||
    v === 'active-advertiser-atx' ||
    v === 'active-advertiser-sa' ||
    v === 'non-advertiser-atx' ||
    v === 'non-advertiser-sa'
  );
}
