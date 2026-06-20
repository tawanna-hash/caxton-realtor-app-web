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
    accent:  '#2563eb',
  },
  {
    segment: 'active-advertiser-sa',
    slug:    'active-advertisers-sa',
    label:   'Active Advertisers - Newsline San Antonio',
    caption: 'Currently-active Newsline San Antonio advertisers and their staff.',
    accent:  '#3b82f6',
  },
  {
    segment: 'non-advertiser-atx',
    slug:    'non-advertisers-atx',
    label:   'Non-Advertisers - RealtyLine ATX',
    caption: 'RealtyLine ATX prospects who haven’t run an ad yet.',
    accent:  '#f97316',
  },
  {
    segment: 'non-advertiser-sa',
    slug:    'non-advertisers-sa',
    label:   'Non-Advertisers - Newsline San Antonio',
    caption: 'Newsline San Antonio prospects who haven’t run an ad yet.',
    accent:  '#ea580c',
  },
  {
    segment: 'manual-newsline',
    slug:    'manual-newsline-contacts',
    label:   'Manual Newsline San Antonio Contacts',
    caption: 'Newsline San Antonio contacts entered or imported manually.',
    accent:  '#3b82f6',
  },
  {
    segment: 'realtor',
    slug:    'realtors',
    label:   'REALTORS',
    caption: 'Licensed real estate agents — your core audience.',
    accent:  '#301D5D',
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

// ============================================================
// Geographic anchor for each mailing segment.
//
// Address verification + the "Within 60 mi" KPI use a board-of-REALTORS
// office as the reference point. Newsline San Antonio audiences anchor on
// SABOR (San Antonio Board of REALTORS); RealtyLine Austin audiences anchor
// on ABoR (Austin Board of REALTORS) — and ATX additionally checks the Five
// Points office. The 'realtor' segment is Texas-wide so it inherits the
// ABoR/Five Points anchors as the default Austin-centric view.
// ============================================================

export type SegmentAnchor = 'sabor' | 'abor';

export function anchorForSegment(seg: MailingSegment): SegmentAnchor {
  switch (seg) {
    case 'manual-newsline':
    case 'active-advertiser-sa':
    case 'non-advertiser-sa':
      return 'sabor';
    case 'active-advertiser-atx':
    case 'non-advertiser-atx':
    case 'realtor':
      return 'abor';
  }
}

export function isSaborSegment(seg: MailingSegment): boolean {
  return anchorForSegment(seg) === 'sabor';
}
