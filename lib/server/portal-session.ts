// lib/server/portal-session.ts
//
// Server-only: read the current portal session from cookies and resolve
// the bearer advertiser. Returns null if no session, expired, or revoked.

import { cookies } from 'next/headers';
import { getSql } from '@/lib/db';
import {
  PORTAL_SESSION_COOKIE,
  isSessionActive,
  type PortalMagicLink,
} from '@/lib/portal';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PortalSessionUser {
  link_id: string;
  advertiser_id: number;
  name: string;
  email: string | null;
  company: string | null;
  session_expires_at: string;
}

/** Resolve the current portal session, or return null. Server-only. */
export async function getCurrentPortalUser(): Promise<PortalSessionUser | null> {
  const jar = await cookies();
  const linkId = jar.get(PORTAL_SESSION_COOKIE)?.value;
  if (!linkId || !UUID_RE.test(linkId)) return null;

  const sql = getSql();
  const rows = (await sql`
    SELECT
      l.id, l.advertiser_id, l.purpose, l.link_expires_at,
      l.consumed_at, l.session_expires_at, l.sent_to_email, l.sent_at,
      l.created_by, l.revoked_at, l.revoked_reason,
      a.name, a.portal_email AS email, a.company
    FROM portal_magic_links l
    JOIN advertisers a ON a.id = l.advertiser_id
    WHERE l.id = ${linkId}
  `) as unknown as (PortalMagicLink & { name: string; email: string | null; company: string | null })[];
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!isSessionActive(row)) return null;

  return {
    link_id: row.id,
    advertiser_id: row.advertiser_id,
    name: row.name,
    email: row.email,
    company: row.company,
    session_expires_at: row.session_expires_at as string,
  };
}
