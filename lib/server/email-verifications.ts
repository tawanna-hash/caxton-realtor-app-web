// lib/server/email-verifications.ts
//
// Unified email-verification store. All admin tables (mailing_contacts,
// realtors, newsletter_subscribers) can LEFT JOIN on lower(email) to
// render a verification badge. Verification is performed by the
// in-house SMTP probe in lib/email-verify.ts (no external API quota
// required) so we can mark unlimited emails for free.
//
// Public surface:
//   - verifyAndStore(email)             single verify + upsert
//   - verifyBatch(emails, concurrency)  batch verify with concurrency
//   - pickPendingEmails(limit, source?) pull oldest-unverified addresses
//                                       from any source table for the drip
//   - getStatus(email)                  current row (or null)
//   - backfillFromMailingContacts()     one-shot import of legacy
//                                       email_status into the unified table
//
// The mapped status values match the unified vocabulary defined in
// the email_verifications CHECK constraint:
//   'valid' | 'invalid' | 'risky' | 'unknown' | 'pending'

import { getSql } from '@/lib/db';
import { verifyEmail, type EmailVerdict, type EmailVerifyResult } from '@/lib/email-verify';

type UnifiedStatus = 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending';

export interface EmailVerificationRow {
  email: string;
  status: UnifiedStatus;
  sub_status: string | null;
  provider: string;
  verified_at: string | null;
  risk_score: number | null;
}

/**
 * Map the in-house SMTP probe verdict to the unified status. The probe
 * returns 'Valid' | 'Invalid' | 'Pending'; we promote 'Pending' to
 * 'risky' when the probe flagged a managed-mail or catch-all domain,
 * and to 'unknown' otherwise so the badge surfaces something useful.
 */
function mapVerdict(result: EmailVerifyResult): UnifiedStatus {
  const v: EmailVerdict = result.verdict;
  if (v === 'Valid') return 'valid';
  if (v === 'Invalid') return 'invalid';
  // Pending — try to be a little smarter.
  if (result.signals?.managedMailProvider) return 'risky';
  if (result.signals?.catchAll) return 'risky';
  return 'unknown';
}

/** Lower-case + trim. Returns null if obviously not an email. */
function normalize(e: string | null | undefined): string | null {
  if (!e) return null;
  const t = e.trim().toLowerCase();
  if (!t || !t.includes('@')) return null;
  return t;
}

/**
 * Verify a single address and upsert its result. Always returns the
 * stored row. Safe to call repeatedly — a row younger than `ttlDays`
 * is returned without re-verifying.
 */
export async function verifyAndStore(
  rawEmail: string,
  opts: { ttlDays?: number; force?: boolean } = {},
): Promise<EmailVerificationRow | null> {
  const email = normalize(rawEmail);
  if (!email) return null;

  const sql = getSql();
  const ttlDays = opts.ttlDays ?? 60;

  // Skip if a fresh record already exists.
  if (!opts.force) {
    const existing = (await sql`
      SELECT email, status, sub_status, provider, verified_at, risk_score
      FROM email_verifications
      WHERE email = ${email}
        AND verified_at IS NOT NULL
        AND verified_at > NOW() - (${ttlDays} || ' days')::interval
      LIMIT 1
    `) as EmailVerificationRow[];
    if (existing.length > 0) return existing[0];
  }

  let mapped: UnifiedStatus = 'unknown';
  let subStatus: string | null = null;
  let risk: number | null = null;
  let raw: unknown = null;

  try {
    const result = await verifyEmail(email);
    mapped = mapVerdict(result);
    subStatus = result.detail ?? null;
    risk = typeof result.risk === 'number' ? Math.round(result.risk) : null;
    raw = result;
  } catch (err) {
    mapped = 'unknown';
    subStatus = err instanceof Error ? err.message.slice(0, 200) : 'verify_error';
  }

  const inserted = (await sql`
    INSERT INTO email_verifications
      (email, status, sub_status, provider, verified_at, risk_score, raw, updated_at)
    VALUES
      (${email}, ${mapped}, ${subStatus}, 'smtp', NOW(), ${risk}, ${raw as object}::jsonb, NOW())
    ON CONFLICT (email) DO UPDATE
      SET status      = EXCLUDED.status,
          sub_status  = EXCLUDED.sub_status,
          provider    = EXCLUDED.provider,
          verified_at = EXCLUDED.verified_at,
          risk_score  = EXCLUDED.risk_score,
          raw         = EXCLUDED.raw,
          updated_at  = NOW()
    RETURNING email, status, sub_status, provider, verified_at, risk_score
  `) as EmailVerificationRow[];
  return inserted[0] ?? null;
}

/**
 * Verify many addresses with a concurrency cap. Bad inputs are
 * silently skipped. Returns the count of newly-verified rows.
 */
export async function verifyBatch(
  emails: string[],
  concurrency = 5,
): Promise<{ verified: number; skipped: number }> {
  const queue = Array.from(new Set(emails.map(normalize).filter((e): e is string => !!e)));
  let verified = 0;
  let skipped = 0;

  async function worker() {
    while (queue.length > 0) {
      const email = queue.shift();
      if (!email) return;
      try {
        const row = await verifyAndStore(email);
        if (row) verified += 1; else skipped += 1;
      } catch {
        skipped += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return { verified, skipped };
}

/**
 * Pull oldest-unverified emails across realtors + newsletter_subscribers
 * for the drip cron. Mailing_contacts and holding emails are handled by
 * the legacy verify-pending-batch cron and are excluded here.
 *
 * @param limit max number of addresses to return
 */
export async function pickPendingEmails(limit: number): Promise<string[]> {
  if (limit <= 0) return [];
  const sql = getSql();

  // Union: realtors + newsletter_subscribers, lower-cased, where there
  // is NO matching row in email_verifications OR the row is stale.
  const rows = (await sql`
    WITH src AS (
      SELECT lower(email) AS email
      FROM realtors
      WHERE email IS NOT NULL AND email <> '' AND status IS DISTINCT FROM 'inactive'
      UNION
      SELECT lower(email) AS email
      FROM newsletter_subscribers
      WHERE email IS NOT NULL AND email <> '' AND status IS DISTINCT FROM 'unsubscribed'
    )
    SELECT s.email
    FROM src s
    LEFT JOIN email_verifications ev ON ev.email = s.email
    WHERE ev.email IS NULL
       OR ev.verified_at IS NULL
       OR ev.verified_at < NOW() - INTERVAL '180 days'
    ORDER BY COALESCE(ev.verified_at, '1970-01-01'::timestamptz) ASC
    LIMIT ${limit}
  `) as Array<{ email: string }>;
  return rows.map(r => r.email);
}

/** Read a single status row. */
export async function getStatus(rawEmail: string): Promise<EmailVerificationRow | null> {
  const email = normalize(rawEmail);
  if (!email) return null;
  const sql = getSql();
  const rows = (await sql`
    SELECT email, status, sub_status, provider, verified_at, risk_score
    FROM email_verifications WHERE email = ${email} LIMIT 1
  `) as EmailVerificationRow[];
  return rows[0] ?? null;
}
