// lib/server/mailing/segments.ts
//
// Canonical mailing-segment enum + slug helpers.

// ============================================================

export type MailingSegment =
  | 'manual-newsline'
  | 'realtor'
  | 'realtyline-atx-print'
  | 'newsline-sa-print'
  | 'active-advertiser-atx'
  | 'active-advertiser-sa'
  | 'non-advertiser-atx'
  | 'non-advertiser-sa'
  | 'email-only-atx'
  | 'email-only-sa';

export const SEGMENTS: { segment: MailingSegment; slug: string; label: string; caption: string; accent: string }[] = [
  {
    segment: 'realtyline-atx-print',
    slug:    'realtyline-austin-print-mailing',
    label:   'RealtyLine Austin Print Mailing',
    caption: 'Combined Austin print audience — Active Advertisers + REALTORS, tagged by source.',
    accent:  '#301D5D',
  },
  {
    segment: 'newsline-sa-print',
    slug:    'newsline-san-antonio-print-mailing',
    label:   'Newsline San Antonio Print Mailing',
    caption: 'Combined San Antonio print audience — Active Advertisers + Non-Advertisers + Manual contacts, tagged by source.',
    accent:  '#1d4ed8',
  },
  {
    segment: 'email-only-atx',
    slug:    'email-only-atx',
    label:   'Email-Only — RealtyLine ATX',
    caption: 'Austin contacts with a valid email but no mailing address. Auto-routed here on save + sync.',
    accent:  '#0e7490',
  },
  {
    segment: 'email-only-sa',
    slug:    'email-only-sa',
    label:   'Email-Only — Newsline San Antonio',
    caption: 'San Antonio contacts with a valid email but no mailing address. Auto-routed here on save + sync.',
    accent:  '#0891b2',
  },
];

export function segmentFromSlug(slug: string): MailingSegment | null {
  const m = SEGMENTS.find((s) => s.slug === slug);
  if (m) return m.segment;
  // Back-compat: old slug 'advertisers' → new segment 'manual-newsline'.
  if (slug === 'advertisers') return 'manual-newsline';
  // Back-compat for legacy URLs that point at retired Austin segments.
  // The three Austin lists (Active Advertisers ATX, Non-Advertisers ATX,
  // and REALTORS) were merged into a single 'realtyline-atx-print'
  // segment with row-level tags on 2026-06-21, so any old bookmark or
  // saved CSV link should resolve to the new combined page.
  if (
    slug === 'active-advertisers' ||
    slug === 'active-advertisers-atx' ||
    slug === 'non-advertisers' ||
    slug === 'non-advertisers-atx' ||
    slug === 'realtors'
  ) {
    return 'realtyline-atx-print';
  }
  // Back-compat for retired Newsline San Antonio segment slugs. The three
  // SA lists (Active Advertisers SA, Non-Advertisers SA, Manual Newsline
  // San Antonio) were merged into a single 'newsline-sa-print' segment
  // with row-level tags on 2026-06-21.
  if (
    slug === 'active-advertisers-sa' ||
    slug === 'non-advertisers-sa' ||
    slug === 'manual-newsline-contacts'
  ) {
    return 'newsline-sa-print';
  }
  return null;
}

export function slugFromSegment(seg: MailingSegment): string {
  return SEGMENTS.find((s) => s.segment === seg)?.slug ?? seg;
}

export function isMailingSegment(v: unknown): v is MailingSegment {
  return (
    v === 'manual-newsline' ||
    v === 'realtor' ||
    v === 'realtyline-atx-print' ||
    v === 'newsline-sa-print' ||
    v === 'active-advertiser-atx' ||
    v === 'active-advertiser-sa' ||
    v === 'non-advertiser-atx' ||
    v === 'non-advertiser-sa' ||
    v === 'email-only-atx' ||
    v === 'email-only-sa'
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
    case 'newsline-sa-print':
    case 'active-advertiser-sa':
    case 'non-advertiser-sa':
    case 'email-only-sa':
      return 'sabor';
    case 'active-advertiser-atx':
    case 'non-advertiser-atx':
    case 'realtor':
    case 'realtyline-atx-print':
    case 'email-only-atx':
      return 'abor';
  }
}

export function isSaborSegment(seg: MailingSegment): boolean {
  return anchorForSegment(seg) === 'sabor';
}
