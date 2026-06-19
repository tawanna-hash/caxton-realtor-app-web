/**
 * Realtor (subscriber) store — DO Postgres (transient). Underlies the
 * /api/auth/* endpoints. Replace query / withNeonTransaction with Neon
 * equivalents after data migration.
 */

import type { PoolClient } from '@neondatabase/serverless';
import { query, withNeonTransaction } from './db/neon';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RealtorBasic {
  id: string;
  email: string;
  email_verified_at: Date | null;
}

export interface RealtorMeRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  market: string;
  trec_license_number: string | null;
  trec_license_status: string | null;
  license_verified_at: Date | null;
  brokerage_name: string | null;
  email_verified_at: Date | null;
  created_at: Date;
  password_set_at: Date | null;
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

export async function findRealtorByEmail(email: string): Promise<RealtorBasic | null> {
  const rows = await query<RealtorBasic>(
    `SELECT id, email, email_verified_at FROM realtors WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function findRealtorForLogin(
  email: string,
): Promise<{ first_name: string; email_verified_at: Date | null } | null> {
  const rows = await query<{ first_name: string; email_verified_at: Date | null }>(
    `SELECT first_name, email_verified_at FROM realtors WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getRealtorMe(realtorId: string): Promise<RealtorMeRow | null> {
  const rows = await query<RealtorMeRow>(
    `SELECT id, email, first_name, last_name, market,
            trec_license_number, trec_license_status, license_verified_at,
            brokerage_name, email_verified_at, created_at,
            password_set_at
     FROM realtors WHERE id = $1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export async function bumpLastAppOpen(realtorId: string): Promise<void> {
  await query(`UPDATE realtors SET last_app_open_at = NOW() WHERE id = $1`, [realtorId]);
}

// -----------------------------------------------------------------------------
// Signup
// -----------------------------------------------------------------------------

export interface SignupRow {
  email: string;
  firstName: string;
  lastName: string;
  market: 'austin' | 'san_antonio' | 'both';
  consentText: string;
  ipAddress: string | null;
  normalizedLicenseType: 'TREC' | 'NMLS' | null;
  trecNumber: string | null;
  nmlsNumber: string | null;
  title: string | null;
  mobile: string | null;
  mailingAddress: string | null;
  mailingAddress2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  subscriptions: string[];
  fbHandle: string | null;
  igHandle: string | null;
  liHandle: string | null;
  passwordHash: string | null;
}

export async function insertRealtor(client: PoolClient, row: SignupRow): Promise<void> {
  await client.query(
    `INSERT INTO realtors (
       email, first_name, last_name, market,
       master_list_consent_at, master_list_consent_text, master_list_consent_ip,
       license_type, trec_license_number, nmls_license_number,
       title, mobile,
       mailing_address, mailing_address_2, city, state, zip,
       birthday_month, birthday_day,
       subscriptions,
       fb_handle, ig_handle, li_handle,
       password_hash, password_set_at
     ) VALUES (
       $1, $2, $3, $4,
       NOW(), $5, $6,
       $7, $8, $9,
       $10, $11,
       $12, $13, $14, $15, $16,
       $17, $18,
       $19,
       $20, $21, $22,
       $23, CASE WHEN $23 IS NOT NULL THEN NOW() ELSE NULL END
     )`,
    [
      row.email,
      row.firstName,
      row.lastName,
      row.market,
      row.consentText,
      row.ipAddress,
      row.normalizedLicenseType,
      row.trecNumber,
      row.nmlsNumber,
      row.title,
      row.mobile,
      row.mailingAddress,
      row.mailingAddress2,
      row.city,
      row.state,
      row.zip,
      row.birthdayMonth,
      row.birthdayDay,
      row.subscriptions,
      row.fbHandle,
      row.igHandle,
      row.liHandle,
      row.passwordHash,
    ],
  );
}

export async function findRealtorByEmailTx(
  client: PoolClient,
  email: string,
): Promise<RealtorBasic | null> {
  const { rows } = await client.query<RealtorBasic>(
    `SELECT id, email, email_verified_at FROM realtors WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

// -----------------------------------------------------------------------------
// Verify — first-time setup + returning login bump + giveaway auto-enroll
// -----------------------------------------------------------------------------

const DEFAULT_NOTIFICATION_PREFS: Array<[string, string]> = [
  ['email', 'issue_release'],
  ['email', 'advertiser_incentive'],
  ['email', 'breaking_news'],
  ['email', 'event_reminder'],
  ['email', 'weekly_digest'],
  ['web_push', 'issue_release'],
  ['web_push', 'advertiser_incentive'],
  ['web_push', 'breaking_news'],
  ['web_push', 'event_reminder'],
];

export async function ensureDefaultNotificationPrefs(
  client: PoolClient,
  realtorId: string,
): Promise<void> {
  for (const [channel, category] of DEFAULT_NOTIFICATION_PREFS) {
    await client.query(
      `INSERT INTO notification_preferences (realtor_id, channel, category, enabled, consent_timestamp)
       VALUES ($1, $2::notification_channel_enum, $3::notification_category_enum, TRUE, NOW())
       ON CONFLICT (realtor_id, channel, category) DO NOTHING`,
      [realtorId, channel, category],
    );
  }
}

export async function autoEnrollSignupGiveaways(
  client: PoolClient,
  realtorId: string,
): Promise<number> {
  const r = await client.query(
    `INSERT INTO giveaway_entries (giveaway_id, realtor_id, rule_id)
     SELECT gr.giveaway_id, r.id, gr.id
     FROM giveaway_rules gr
     JOIN giveaways g ON g.id = gr.giveaway_id
     JOIN realtors r ON r.id = $1
     WHERE gr.action_type = 'signup'
       AND g.status = 'active'
       AND g.starts_at <= NOW()
       AND g.ends_at >= NOW()
       AND (g.publication = r.market OR g.publication = 'both' OR r.market = 'both')
     ON CONFLICT (giveaway_id, realtor_id, rule_id) DO NOTHING
     RETURNING giveaway_id`,
    [realtorId],
  );
  return r.rowCount ?? 0;
}

export async function markVerifiedAndLogin(
  client: PoolClient,
  realtorId: string,
): Promise<void> {
  await client.query(
    `UPDATE realtors SET email_verified_at = NOW(), last_login_at = NOW() WHERE id = $1`,
    [realtorId],
  );
}

export async function bumpLastLogin(client: PoolClient, realtorId: string): Promise<void> {
  await client.query(`UPDATE realtors SET last_login_at = NOW() WHERE id = $1`, [realtorId]);
}

// -----------------------------------------------------------------------------
// Password auth
// -----------------------------------------------------------------------------

export interface RealtorLoginRow {
  id: string;
  email: string;
  password_hash: string | null;
  email_verified_at: Date | null;
}

export async function findRealtorForPasswordLogin(
  email: string,
): Promise<RealtorLoginRow | null> {
  const rows = await query<RealtorLoginRow>(
    `SELECT id, email, password_hash, email_verified_at
     FROM realtors
     WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function bumpLoginNow(realtorId: string): Promise<void> {
  await query(`UPDATE realtors SET last_login_at = NOW() WHERE id = $1`, [realtorId]);
}

export async function getPasswordHash(
  realtorId: string,
): Promise<{ password_hash: string | null } | null> {
  const rows = await query<{ password_hash: string | null }>(
    `SELECT password_hash FROM realtors WHERE id = $1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export async function updatePasswordHash(
  realtorId: string,
  newHash: string,
): Promise<void> {
  await query(
    `UPDATE realtors SET password_hash = $1, password_set_at = NOW() WHERE id = $2`,
    [newHash, realtorId],
  );
}

export async function findVerifiedRealtorForReset(
  email: string,
): Promise<{ id: string; first_name: string; email: string } | null> {
  const rows = await query<{ id: string; first_name: string; email: string }>(
    `SELECT id, first_name, email
     FROM realtors
     WHERE email = $1 AND email_verified_at IS NOT NULL`,
    [email],
  );
  return rows[0] ?? null;
}

export async function insertPasswordResetToken(
  realtorId: string,
  tokenHash: string,
  expiresAt: Date,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  await query(
    `INSERT INTO password_reset_tokens (realtor_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [realtorId, tokenHash, expiresAt, ipAddress, userAgent],
  );
}

export async function logEmailSent(
  emailType: string,
  providerName: string,
  messageId: string | null,
  toAddress: string,
  subject: string,
): Promise<void> {
  await query(
    `INSERT INTO email_log (email_type, provider, provider_message_id, to_address, subject)
     VALUES ($1, $2, $3, $4, $5)`,
    [emailType, providerName, messageId, toAddress, subject],
  );
}

export interface ResetTokenRow {
  id: string;
  realtor_id: string;
  expires_at: Date;
  consumed_at: Date | null;
}

export async function lockResetTokenTx(
  client: PoolClient,
  tokenHash: string,
): Promise<ResetTokenRow | null> {
  const { rows } = await client.query<ResetTokenRow>(
    `SELECT id, realtor_id, expires_at, consumed_at
     FROM password_reset_tokens
     WHERE token = $1
     FOR UPDATE`,
    [tokenHash],
  );
  return rows[0] ?? null;
}

export async function applyPasswordResetTx(
  client: PoolClient,
  realtorId: string,
  newHash: string,
): Promise<{ email: string } | null> {
  const { rows } = await client.query<{ email: string }>(
    `UPDATE realtors
     SET password_hash = $1, password_set_at = NOW(), last_login_at = NOW()
     WHERE id = $2
     RETURNING email`,
    [newHash, realtorId],
  );
  return rows[0] ?? null;
}

export async function consumeResetTokenTx(
  client: PoolClient,
  tokenId: string,
): Promise<void> {
  await client.query(
    `UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = $1`,
    [tokenId],
  );
}

/**
 * Permanently delete a realtor account and all dependent rows.
 *
 * App Store Review Guideline 5.1.1(v) requires in-app account deletion when
 * the app supports account creation. This is the destructive backing call.
 *
 * Most dependent tables (push_subscriptions, native_push_tokens, passkey
 * tables, notification_preferences/deliveries, giveaway_entries,
 * password_reset_tokens, webauthn_challenges) have ON DELETE CASCADE so
 * they clear automatically.
 *
 * Two tables hold the realtor_id as NO ACTION for audit/historical reasons:
 *   - email_log (delivery audit trail)
 *   - giveaways.winner_realtor_id (preserves the historical fact that this
 *     giveaway had a winner, even if the winner later deleted their account)
 *
 * For those we NULL the reference before DELETE so the audit/history row
 * survives without the personal link.
 *
 * Returns true if a row was deleted, false if the id was not found.
 */
export async function deleteRealtorAccount(realtorId: string): Promise<boolean> {
  return withNeonTransaction(async (client) => {
    // Drop the personal back-references on tables we keep for history.
    await client.query(
      `UPDATE email_log SET realtor_id = NULL WHERE realtor_id = $1`,
      [realtorId],
    );
    await client.query(
      `UPDATE giveaways SET winner_realtor_id = NULL WHERE winner_realtor_id = $1`,
      [realtorId],
    );
    // Drop the magic_links rows tied to this email so old magic links cannot
    // resurrect the address. magic_links keys on email, not realtor_id.
    const emailRow = await client.query(
      `SELECT email FROM realtors WHERE id = $1`,
      [realtorId],
    );
    const email = emailRow.rows[0]?.email as string | undefined;
    if (email) {
      await client.query(`DELETE FROM magic_links WHERE email = $1`, [email]);
    }
    const r = await client.query(
      `DELETE FROM realtors WHERE id = $1`,
      [realtorId],
    );
    return (r.rowCount ?? 0) > 0;
  });
}

// Re-export for callers that want a transaction.
export { withNeonTransaction };
