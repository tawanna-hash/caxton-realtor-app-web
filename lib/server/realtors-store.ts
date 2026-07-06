/**
 * Realtor (subscriber) store — DO Postgres (transient). Underlies the
 * /api/auth/* endpoints. Replace query / withNeonTransaction with Neon
 * equivalents after data migration.
 */

import type { PoolClient } from '@neondatabase/serverless';
import { query, withNeonTransaction } from './db/neon';
import { logger } from './logger';

// Postgres SQLSTATE 42703 = undefined_column (column does not exist).
// 42P01 = undefined_table. We swallow these in optional-update steps so a
// stale prod schema can't block account creation.
const PG_UNDEFINED_COLUMN = '42703';
const PG_UNDEFINED_TABLE = '42P01';

function isMissingSchemaError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === PG_UNDEFINED_COLUMN || code === PG_UNDEFINED_TABLE;
}

/**
 * Run an optional UPDATE step. If the column or table doesn't exist on the
 * deployed DB we log + continue so the signup completes; any other error is
 * rethrown.
 */
async function tryOptionalUpdate(
  client: PoolClient,
  label: string,
  sql: string,
  params: unknown[],
): Promise<void> {
  try {
    await client.query(sql, params);
  } catch (err) {
    if (isMissingSchemaError(err)) {
      logger.warn(
        { step: label, code: (err as { code?: string }).code, message: (err as Error).message },
        'insertRealtor: skipping optional column group (schema missing)',
      );
      return;
    }
    throw err;
  }
}

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

/**
 * Insert a new realtor.
 *
 * Returns the new id, plus the resolved email_verified_at value (NULL when the
 * caller did not auto-verify, a timestamp when it did). Callers that want to
 * issue an instant session (signup-with-password on iOS, where the follow-up
 * magic-link click leaves us stranded in a separate cookie jar) pass
 * `autoVerifyEmail: true` after validating a strong password.
 *
 * Rewritten 2026-06-30 to survive prod schema drift. Previously a single big
 * INSERT touched 24 columns; if any one was missing in prod (because a
 * migration had not been applied) every signup failed with a 500. Now:
 *
 *   1. CORE INSERT - only columns the rest of the codebase already reads in
 *      working endpoints (login, /auth/me). Guaranteed to exist in prod.
 *   2. OPTIONAL UPDATES - one UPDATE per logical column group, each wrapped
 *      in tryOptionalUpdate() which swallows SQLSTATE 42703 (undefined_column)
 *      so a missing optional column logs a warning instead of dropping the
 *      whole signup. Any other error rethrows.
 *
 * Net effect: an account is created even on a partially-migrated DB; the
 * realtor can sign in immediately; warnings surface the missing column for
 * follow-up.
 */
export async function insertRealtor(
  client: PoolClient,
  row: SignupRow,
  opts: { autoVerifyEmail?: boolean } = {},
): Promise<{ id: string; emailVerifiedAt: Date | null }> {
  const autoVerify = !!opts.autoVerifyEmail;

  // -- 1. CORE INSERT --------------------------------------------------------
  // Only columns we know exist in every deployed environment. These are
  // referenced by getRealtorMe(), findRealtorForPasswordLogin(), and
  // updatePasswordHash() - endpoints that work in prod today, so the columns
  // must be present.
  // We compute the two derived timestamps in JS to avoid referencing the same
  // $N placeholder in multiple expressions (which has caused intermittent
  // 42P08 ambiguous_parameter errors from the planner on Neon's pooled
  // connections). Now every $N appears exactly once, each with an explicit
  // type, so type inference is bulletproof.
  const nowTs = new Date();
  const passwordSetAt: Date | null = row.passwordHash ? nowTs : null;
  const emailVerifiedAt: Date | null = autoVerify ? nowTs : null;

  const { rows } = await client.query<{ id: string; email_verified_at: Date | null }>(
    `INSERT INTO realtors (
       email, first_name, last_name, market,
       password_hash, password_set_at,
       email_verified_at,
       master_list_consent_at, master_list_consent_text
     ) VALUES (
       $1::text, $2::text, $3::text, $4::market_enum,
       $5::text, $6::timestamptz,
       $7::timestamptz,
       $8::timestamptz, $9::text
     )
     RETURNING id, email_verified_at`,
    [
      row.email,
      row.firstName,
      row.lastName,
      row.market,
      row.passwordHash,
      passwordSetAt,
      emailVerifiedAt,
      nowTs,
      row.consentText,
    ],
  );
  const r = rows[0];
  if (!r) throw new Error('insertRealtor returned no row');
  const realtorId = r.id;

  // -- 2. OPTIONAL UPDATES (best-effort, grouped by feature) -----------------
  // Each group is independent so one missing column cannot block another.
  // We only run an UPDATE when the caller actually supplied a value, so
  // empty groups skip the DB hit entirely.

  // Master-list consent IP (best-effort; NOT NULL fields already set in INSERT).
  if (row.ipAddress) {
    await tryOptionalUpdate(
      client,
      'consent-ip',
      `UPDATE realtors SET master_list_consent_ip = $2::inet WHERE id = $1`,
      [realtorId, row.ipAddress],
    );
  }

  // License (TREC or NMLS - never both; route by normalized type).
  if (row.normalizedLicenseType || row.trecNumber || row.nmlsNumber) {
    await tryOptionalUpdate(
      client,
      'license',
      `UPDATE realtors
          SET license_type = $2,
              trec_license_number = $3,
              nmls_license_number = $4
        WHERE id = $1`,
      [realtorId, row.normalizedLicenseType, row.trecNumber, row.nmlsNumber],
    );
  }

  // Title + mobile.
  if (row.title || row.mobile) {
    await tryOptionalUpdate(
      client,
      'contact',
      `UPDATE realtors SET title = $2, mobile = $3 WHERE id = $1`,
      [realtorId, row.title, row.mobile],
    );
  }

  // Mailing address block.
  if (
    row.mailingAddress ||
    row.mailingAddress2 ||
    row.city ||
    row.state ||
    row.zip
  ) {
    await tryOptionalUpdate(
      client,
      'address',
      `UPDATE realtors
          SET mailing_address = $2,
              mailing_address_2 = $3,
              city = $4,
              state = $5,
              zip = $6
        WHERE id = $1`,
      [
        realtorId,
        row.mailingAddress,
        row.mailingAddress2,
        row.city,
        row.state,
        row.zip,
      ],
    );
  }

  // Birthday - both columns set together (CHECK constraint requires both
  // or neither; the caller already normalized partial input to NULL/NULL).
  if (row.birthdayMonth !== null || row.birthdayDay !== null) {
    await tryOptionalUpdate(
      client,
      'birthday',
      `UPDATE realtors SET birthday_month = $2, birthday_day = $3 WHERE id = $1`,
      [realtorId, row.birthdayMonth, row.birthdayDay],
    );
  }

  // Email subscriptions (text[]).
  if (row.subscriptions && row.subscriptions.length > 0) {
    await tryOptionalUpdate(
      client,
      'subscriptions',
      `UPDATE realtors SET subscriptions = $2 WHERE id = $1`,
      [realtorId, row.subscriptions],
    );
  }

  // Social handles.
  if (row.fbHandle || row.igHandle || row.liHandle) {
    await tryOptionalUpdate(
      client,
      'social',
      `UPDATE realtors
          SET fb_handle = $2, ig_handle = $3, li_handle = $4
        WHERE id = $1`,
      [realtorId, row.fbHandle, row.igHandle, row.liHandle],
    );
  }

  return { id: realtorId, emailVerifiedAt: r.email_verified_at };
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
    `INSERT INTO password_reset_tokens (realtor_id, token_hash, expires_at, ip_address, user_agent)
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
     WHERE token_hash = $1 AND realtor_id IS NOT NULL
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
 * Most dependent tables (push_subscriptions, native_push_tokens,
 * notification_preferences/deliveries, giveaway_entries,
 * password_reset_tokens) have ON DELETE CASCADE so they clear
 * automatically.
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

// -----------------------------------------------------------------------------
// Sign in with Apple support
// -----------------------------------------------------------------------------

export interface RealtorWithApple extends RealtorBasic {
  apple_sub: string | null;
  first_name: string;
  last_name: string;
}

/** Look up a realtor by their stable Apple `sub` identifier. */
export async function findRealtorByAppleSub(
  appleSub: string,
): Promise<RealtorWithApple | null> {
  const rows = await query<RealtorWithApple>(
    `SELECT id, email, email_verified_at, apple_sub, first_name, last_name
       FROM realtors
      WHERE apple_sub = $1
      LIMIT 1`,
    [appleSub],
  );
  return rows[0] ?? null;
}

/**
 * Attach an Apple `sub` to an existing realtor (matched by email on first
 * Apple sign-in). Also verifies their email since Apple has done so.
 */
export async function attachAppleSubToRealtor(
  realtorId: string,
  appleSub: string,
): Promise<void> {
  await query(
    `UPDATE realtors
        SET apple_sub = $2,
            email_verified_at = COALESCE(email_verified_at, NOW())
      WHERE id = $1`,
    [realtorId, appleSub],
  );
}

/**
 * Create a brand-new realtor from a Sign in with Apple flow. Apple only
 * shares first/last name on the FIRST authorization, so callers should be
 * prepared for blank names — we accept whatever we got and let the user
 * edit later from their profile screen.
 *
 * Email is auto-verified because Apple verifies it for us.
 */
export async function insertRealtorViaApple(
  client: PoolClient,
  args: {
    email: string;
    firstName: string;
    lastName: string;
    appleSub: string;
    consentText: string;
    ipAddress: string | null;
  },
): Promise<{ id: string; email: string }> {
  const { rows } = await client.query<{ id: string; email: string }>(
    `INSERT INTO realtors (
       email, first_name, last_name, market,
       master_list_consent_at, master_list_consent_text, master_list_consent_ip,
       subscriptions,
       apple_sub,
       email_verified_at
     ) VALUES (
       $1, $2, $3, 'austin',
       NOW(), $4, $5,
       ARRAY['daily_brief']::text[],
       $6,
       NOW()
     )
     RETURNING id, email`,
    [
      args.email,
      args.firstName || '',
      args.lastName || '',
      args.consentText,
      args.ipAddress,
      args.appleSub,
    ],
  );
  return rows[0];
}

// Re-export for callers that want a transaction.
export { withNeonTransaction };
