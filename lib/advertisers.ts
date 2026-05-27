// lib/advertisers.ts
//
// Shared types and helpers for the advertisers system.

import { randomBytes } from 'crypto';
import type { Publication } from '@/lib/publication-theme';

export interface Advertiser {
  id: number;
  name: string;
  slug: string;
  share_token: string;
  contact_email: string | null;
  requires_email_gate: boolean;
  /**
   * Which publication this advertiser primarily belongs to.
   * Drives branding on the public dashboard and outbound emails.
   * Optional in the type to remain backward-compatible with rows
   * fetched via SELECT statements that don't include the column;
   * `getPublicationTheme()` always returns a valid theme.
   */
  publication?: Publication;
  created_at: string;
  updated_at: string;
}

export interface AdvertiserWithStats extends Advertiser {
  hotspot_count: number;
  clicks_30d: number;
}

/** Generate a URL-safe slug from a free-form name. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** 18-byte (144-bit) url-safe share token. */
export function generateShareToken(): string {
  return randomBytes(18).toString('base64url');
}
