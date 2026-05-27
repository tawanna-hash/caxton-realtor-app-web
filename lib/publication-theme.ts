// lib/publication-theme.ts
//
// Single source of truth for per-publication branding.
// Used in:
//   - Public advertiser dashboard (header + chart colors)
//   - Magic-link email (from-display name + subject + button color)
//   - Admin advertisers list (badge color)
//
// Lazy schema migration adds the `publication` column to the
// advertisers table on first use.

import { getSql } from '@/lib/db';

export type Publication = 'austin' | 'san_antonio' | 'both';

export interface PublicationTheme {
  id: Publication;
  /** Full display name — used in headers and email subject. */
  name: string;
  /** Short label — used in lists and badges. */
  shortName: string;
  /** Hex primary brand color. */
  primaryColor: string;
  /** Hover variant of primary, used for button states. */
  primaryColorHover: string;
  /** From-display in outbound email, e.g. "Newsline San Antonio <hello@...>". */
  fromEmailDisplayName: string;
}

const THEMES: Record<Publication, PublicationTheme> = {
  austin: {
    id: 'austin',
    name: 'RealtyLine Austin',
    shortName: 'RealtyLine',
    primaryColor: '#021D40',
    primaryColorHover: '#03285a',
    fromEmailDisplayName: 'RealtyLine Austin',
  },
  san_antonio: {
    id: 'san_antonio',
    name: 'Newsline San Antonio',
    shortName: 'Newsline SA',
    primaryColor: '#3D0740',
    primaryColorHover: '#52095a',
    fromEmailDisplayName: 'Newsline San Antonio',
  },
  both: {
    id: 'both',
    name: 'Realty News Now',
    shortName: 'Both',
    primaryColor: '#021D40',
    primaryColorHover: '#03285a',
    fromEmailDisplayName: 'Realty News Now',
  },
};

/** Always returns a theme — defaults to Austin if value is missing or unknown. */
export function getPublicationTheme(pub: string | null | undefined): PublicationTheme {
  if (pub === 'san_antonio') return THEMES.san_antonio;
  if (pub === 'both') return THEMES.both;
  return THEMES.austin;
}

/** Selector options for admin forms. */
export const PUBLICATION_OPTIONS: Array<{ id: Publication; label: string }> = [
  { id: 'austin', label: 'RealtyLine Austin' },
  { id: 'san_antonio', label: 'Newsline San Antonio' },
  { id: 'both', label: 'Both' },
];

let columnEnsured = false;

/**
 * Lazy schema migration. Adds `publication` column to advertisers
 * with a default of 'austin' so existing rows are valid immediately.
 */
export async function ensurePublicationColumn(): Promise<void> {
  if (columnEnsured) return;
  const sql = getSql();
  await sql`
    ALTER TABLE advertisers
    ADD COLUMN IF NOT EXISTS publication TEXT NOT NULL DEFAULT 'austin'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_advertisers_publication
    ON advertisers(publication)
  `;
  columnEnsured = true;
}
