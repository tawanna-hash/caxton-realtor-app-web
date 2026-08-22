// lib/advertiser-grants.ts
//
// Helpers for the public advertiser dashboard's email-gate flow.
//
// Schema: lazy-created on first use; no need to patch lib/db.ts.

import { randomBytes } from 'crypto';
import { getSql } from '@/lib/db';

/** ~32 url-safe chars (192 bits of entropy). */
export function generateGrantToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Magic link expires this many hours after creation. */
export const MAGIC_LINK_EXPIRY_HOURS = 24;
/** Cookie / verified access valid for this many days after click. */
export const ACCESS_COOKIE_DAYS = 30;

let schemaEnsured = false;

/** Lazy schema creation — call before any grants table query. */
export async function ensureGrantsSchema(): Promise<void> {
  if (schemaEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS advertiser_email_grants (
      id SERIAL PRIMARY KEY,
      advertiser_id INTEGER NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
      grant_token TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      verified_at TIMESTAMPTZ,
      ip_at_request TEXT,
      ip_at_verify TEXT
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_adv_grants_advertiser ON advertiser_email_grants(advertiser_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_adv_grants_token ON advertiser_email_grants(grant_token)`;
  schemaEnsured = true;
}

/** Cookie name scoped to a single advertiser. */
export function grantCookieName(advertiserId: number): string {
  return `adv_grant_${advertiserId}`;
}

/** Is this cookie value a live, verified grant for this advertiser? */
export async function isCookieGrantValid(
  advertiserId: number,
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  await ensureGrantsSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id FROM advertiser_email_grants
    WHERE advertiser_id = ${advertiserId}
      AND grant_token = ${cookieValue}
      AND verified_at IS NOT NULL
      AND expires_at > NOW()
    LIMIT 1
  `) as unknown as Array<{ id: number }>;
  return rows.length > 0;
}
