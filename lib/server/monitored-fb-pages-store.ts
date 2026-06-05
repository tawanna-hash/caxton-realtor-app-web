/**
 * Data access for monitored_fb_pages — admin-curated list of Facebook Pages
 * that we *follow* (don't admin). Scanned by /api/cron/scan-followed-fb-pages
 * via headless Chromium since FB exposes no API for Pages we don't admin.
 */

import { getSql } from '@/lib/db';
import type { Publication } from '@/lib/server/events-store';

export type MonitoredPub = Publication;

export interface MonitoredFbPage {
  id: number;
  slug: string;
  label: string;
  pub: MonitoredPub;
  is_active: boolean;
  last_scanned_at: string | null;
  last_post_count: number;
  last_detected: number;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

interface DbRow {
  id: number;
  slug: string;
  label: string;
  pub: MonitoredPub;
  is_active: boolean;
  last_scanned_at: string | null;
  last_post_count: number;
  last_detected: number;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

/**
 * Extracts the FB Page slug from anything an admin might paste:
 *   https://www.facebook.com/HomeBuildersAssociationGreaterAustin/
 *   https://m.facebook.com/HomeBuildersAssociationGreaterAustin
 *   facebook.com/HomeBuildersAssociationGreaterAustin
 *   HomeBuildersAssociationGreaterAustin
 *   @HomeBuildersAssociationGreaterAustin
 *
 * Returns null if no slug can be extracted.
 *
 * Numeric Page IDs are accepted too (FB sometimes only exposes /{numeric_id}/).
 */
export function parseFbPageSlug(input: string): string | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;
  // Strip protocol + host
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^(www\.|m\.|mobile\.|web\.|business\.)?facebook\.com\//i, '');
  // Strip leading @ and slash
  s = s.replace(/^[@/]+/, '');
  // Drop query string + trailing slash + pages path segments
  s = s.split('?')[0];
  s = s.split('#')[0];
  s = s.replace(/\/+$/, '');
  // pages/<name>/<id> form → use the id segment
  if (/^pages\//i.test(s)) {
    const parts = s.split('/');
    // pages/Some-Name-Here/123456789012345
    if (parts.length >= 3 && /^\d+$/.test(parts[2])) return parts[2];
    if (parts.length >= 2) return parts[1];
  }
  // Take only the first path segment (drop /posts, /events, etc.)
  s = s.split('/')[0];
  if (!s) return null;
  // Slugs are alphanumeric + dots + dashes + underscores, or numeric IDs
  if (!/^[A-Za-z0-9._-]+$/.test(s)) return null;
  return s;
}

export async function listMonitoredFbPages(): Promise<MonitoredFbPage[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM monitored_fb_pages
    ORDER BY is_active DESC, label ASC
  `) as DbRow[];
  return rows;
}

export async function listDueMonitoredFbPages(limit: number): Promise<MonitoredFbPage[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM monitored_fb_pages
    WHERE is_active = TRUE
    ORDER BY last_scanned_at NULLS FIRST, id ASC
    LIMIT ${limit}
  `) as DbRow[];
  return rows;
}

export interface CreateMonitoredFbPageInput {
  slug: string;
  label: string;
  pub: MonitoredPub;
}

export async function createMonitoredFbPage(
  input: CreateMonitoredFbPageInput
): Promise<MonitoredFbPage> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO monitored_fb_pages (slug, label, pub, is_active)
    VALUES (${input.slug}, ${input.label}, ${input.pub}, TRUE)
    ON CONFLICT (slug) DO UPDATE SET
      label = EXCLUDED.label,
      pub = EXCLUDED.pub,
      is_active = TRUE,
      updated_at = NOW()
    RETURNING *
  `) as DbRow[];
  return rows[0];
}

export async function setMonitoredFbPageActive(
  id: number,
  isActive: boolean
): Promise<MonitoredFbPage | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE monitored_fb_pages
    SET is_active = ${isActive}, updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `) as DbRow[];
  return rows[0] ?? null;
}

export async function deleteMonitoredFbPage(id: number): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM monitored_fb_pages WHERE id = ${id} RETURNING id
  `) as Array<{ id: number }>;
  return rows.length > 0;
}

export async function recordMonitoredFbPageScan(input: {
  id: number;
  postCount: number;
  detected: number;
  error: string | null;
}): Promise<void> {
  const sql = getSql();
  if (input.error) {
    await sql`
      UPDATE monitored_fb_pages
      SET last_scanned_at = NOW(),
          last_post_count = ${input.postCount},
          last_detected = ${input.detected},
          last_error = ${input.error},
          consecutive_failures = consecutive_failures + 1,
          updated_at = NOW()
      WHERE id = ${input.id}
    `;
  } else {
    await sql`
      UPDATE monitored_fb_pages
      SET last_scanned_at = NOW(),
          last_post_count = ${input.postCount},
          last_detected = ${input.detected},
          last_error = NULL,
          consecutive_failures = 0,
          updated_at = NOW()
      WHERE id = ${input.id}
    `;
  }
}
