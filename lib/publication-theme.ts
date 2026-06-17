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

// Single-publication key. 'both' is legacy and is no longer surfaced in
// the UI; it lingers only so historical reads of a single legacy row do
// not throw. Multi-pub storage is now a CSV of these keys (minus 'both')
// — e.g. 'austin,houston'. See parsePublications() / serializePublications().
export type Publication = 'austin' | 'san_antonio' | 'houston' | 'dallas' | 'both';

// Keys that the UI exposes as checkboxes. Excludes the legacy 'both'.
export const PUBLICATION_KEYS = [
  'austin',
  'san_antonio',
  'houston',
  'dallas',
] as const satisfies readonly Publication[];

export type PublicationKey = (typeof PUBLICATION_KEYS)[number];

export function isPublicationKey(value: unknown): value is PublicationKey {
  return typeof value === 'string'
    && (PUBLICATION_KEYS as readonly string[]).includes(value);
}

/**
 * Parse the CSV-encoded `advertisers.publication` column into a sorted,
 * deduped array of canonical PublicationKey values. Legacy 'both' is
 * expanded to ['austin', 'san_antonio']. Unknown / empty inputs fall
 * back to ['austin'] so downstream rendering always has at least one
 * pub to anchor on.
 */
export function parsePublications(raw: string | null | undefined): PublicationKey[] {
  const tokens = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = new Set<PublicationKey>();
  for (const t of tokens) {
    if (t === 'both') {
      out.add('austin');
      out.add('san_antonio');
    } else if (isPublicationKey(t)) {
      out.add(t);
    }
  }
  if (out.size === 0) out.add('austin');
  // Preserve PUBLICATION_KEYS order so badges render consistently.
  return PUBLICATION_KEYS.filter((k) => out.has(k));
}

/**
 * Serialize a publication array back to the CSV form stored in the DB.
 * Deduplicates and orders by PUBLICATION_KEYS so two semantically-equal
 * inputs always produce the same string (helps UPDATEs hit ON CONFLICT
 * properly and keeps audit logs stable).
 */
export function serializePublications(pubs: readonly PublicationKey[]): string {
  const set = new Set(pubs.filter(isPublicationKey));
  if (set.size === 0) set.add('austin');
  return PUBLICATION_KEYS.filter((k) => set.has(k)).join(',');
}

/**
 * Return the "primary" pub for fallbacks that still need a single value
 * (invoice prefix, footer color, magic-link from-name). First in the
 * canonical order wins.
 */
export function primaryPublication(raw: string | null | undefined): PublicationKey {
  return parsePublications(raw)[0]!;
}

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
    shortName: 'Newsline San Antonio',
    primaryColor: '#874F80',
    primaryColorHover: '#52095a',
    fromEmailDisplayName: 'Newsline San Antonio',
  },
  houston: {
    id: 'houston',
    name: 'RealtyLine Houston',
    shortName: 'RealtyLine Houston',
    primaryColor: '#021D40',
    primaryColorHover: '#03285a',
    fromEmailDisplayName: 'RealtyLine Houston',
  },
  dallas: {
    id: 'dallas',
    name: 'RealtyLine Dallas/FTW',
    shortName: 'RealtyLine Dallas/FTW',
    primaryColor: '#021D40',
    primaryColorHover: '#03285a',
    fromEmailDisplayName: 'RealtyLine Dallas/FTW',
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
  if (pub === 'houston')     return THEMES.houston;
  if (pub === 'dallas')      return THEMES.dallas;
  if (pub === 'both')        return THEMES.both;
  return THEMES.austin;
}

/** Selector options for admin forms. Multi-select — "Both" was removed
 *  in favor of letting users check the specific pubs they want. */
export const PUBLICATION_OPTIONS: Array<{ id: PublicationKey; label: string }> = [
  { id: 'austin',      label: 'RealtyLine Austin' },
  { id: 'san_antonio', label: 'Newsline San Antonio' },
  { id: 'houston',     label: 'RealtyLine Houston' },
  { id: 'dallas',      label: 'RealtyLine Dallas/FTW' },
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
  // ── Multi-publication migration (Session 22) ────────────────────
  // 'both' is no longer a real publication — it was a UI shortcut for
  // "Austin + San Antonio". Storage now holds a CSV (e.g. 'austin,houston').
  // Idempotent: subsequent runs no-op because no rows match.
  try {
    await sql`
      UPDATE advertisers
         SET publication = 'austin,san_antonio'
       WHERE publication = 'both'
    `;
  } catch (err) {
    console.warn(
      '[ensurePublicationColumn] both->csv migration failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
  columnEnsured = true;
}
