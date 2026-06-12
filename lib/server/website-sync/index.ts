// lib/server/website-sync/index.ts
//
// Per-advertiser website sync sources. The admin "Sync from website" button
// looks up the matching source for the advertiser's website hostname and
// runs it. Adding a new source = add a parser file + register here.

import { fetchAustinTitleSync } from './austin-title';
import type { ExtractedLocation, ExtractedStaffMember } from '../gemini-screenshot-extract';

export interface WebsiteSyncResult {
  locations: ExtractedLocation[];
  staff: ExtractedStaffMember[];
}

export interface WebsiteSyncSource {
  /** Display name shown to admins (e.g. "Austin Title website"). */
  label: string;
  /** Hostnames this source handles (case-insensitive, with or without www.). */
  hosts: string[];
  fetch: () => Promise<WebsiteSyncResult>;
}

const SOURCES: WebsiteSyncSource[] = [
  {
    label: 'Austin Title website',
    hosts: ['austintitle.com'],
    fetch: fetchAustinTitleSync,
  },
];

function normalizeHost(input: string | null | undefined): string | null {
  if (!input) return null;
  let raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    raw = u.hostname;
  } catch {
    return null;
  }
  return raw.replace(/^www\./, '');
}

export function getSyncSourceForWebsite(
  website: string | null | undefined,
): WebsiteSyncSource | null {
  const host = normalizeHost(website);
  if (!host) return null;
  return (
    SOURCES.find((s) => s.hosts.some((h) => h === host || host.endsWith(`.${h}`))) ?? null
  );
}
