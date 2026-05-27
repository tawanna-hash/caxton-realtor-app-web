// lib/advertisers.ts
//
// Advertiser data model and helpers. Normalizes the magazine_hotspots
// advertiser_name string into a real entity with stable slug + share
// token, enabling per-advertiser analytics, link-shareable reports, and
// (Phase 3c) optional email-gated access.

import { randomBytes } from 'crypto';

/** Stored row shape. */
export interface Advertiser {
  id: number;
  name: string;
  slug: string;
  share_token: string;
  contact_email: string | null;
  requires_email_gate: boolean;
  created_at: string;
  updated_at: string;
}

/** Row + computed stats. Returned by the admin list endpoint. */
export interface AdvertiserWithStats extends Advertiser {
  hotspot_count: number;
  clicks_30d: number;
}

/**
 * Convert an advertiser name to a URL-safe slug.
 * Used as the public path component in /r/advertiser/:slug.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')          // remove apostrophes / quotes outright
    .replace(/[^a-z0-9]+/g, '-')   // any other non-alphanum → hyphen
    .replace(/^-+|-+$/g, '')       // strip leading/trailing hyphens
    .replace(/-{2,}/g, '-')        // collapse repeats
    .slice(0, 80);                 // cap to a sane length for URL routes
}

/**
 * Generate a URL-safe share token suitable for ?t=... query strings.
 * 18 bytes → 24 url-safe base64 chars, no padding. Plenty of entropy.
 */
export function generateShareToken(): string {
  return randomBytes(18).toString('base64url');
}
