// lib/server/mailing/verification.ts
//
// Holding-row editing + persistence of USPS verification, email verification,
// and geocode results. Originally the "ABOR Members" helper block.

import { getSql } from '@/lib/db';
import type { MailingContactRow, VerifyStatus } from './types';

// ============================================================

export interface HoldingEditInput {
  first_name?:    string | null;
  last_name?:     string | null;
  title?:         string | null;
  email?:         string | null;
  company?:       string | null;
  address?:       string | null;
  address_2?:     string | null;
  city?:          string | null;
  state?:         string | null;
  zip?:           string | null;
  license_number?: string | null;
  phone?:         string | null;
  mobile_phone?:  string | null;
  email_notes?:   string | null;
}

/**
 * Update editable fields on a holding-stage row. Any non-undefined
 * field in the input is written; undefined fields are left untouched.
 * If address/city/state/zip change, the address verification status and
 * geocode are wiped so the user knows to re-verify.
 */
export async function updateHoldingContact(
  id: string,
  input: HoldingEditInput,
): Promise<MailingContactRow | null> {
  const sql = getSql();

  // Pull the existing row so we can detect address changes
  const existingRows = (
    await sql`SELECT * FROM mailing_contacts WHERE id = ${id} AND stage = 'holding'`
  ) as unknown as MailingContactRow[];
  const existing = existingRows[0];
  if (!existing) return null;

  const next = {
    first_name:     input.first_name     !== undefined ? input.first_name     : existing.first_name,
    last_name:      input.last_name      !== undefined ? input.last_name      : existing.last_name,
    title:          input.title          !== undefined ? input.title          : existing.title,
    email:          input.email          !== undefined ? input.email          : existing.email,
    company:        input.company        !== undefined ? input.company        : existing.company,
    address:        input.address        !== undefined ? input.address        : existing.address,
    address_2:      input.address_2      !== undefined ? input.address_2      : existing.address_2,
    city:           input.city           !== undefined ? input.city           : existing.city,
    state:          input.state          !== undefined ? input.state          : existing.state,
    zip:            input.zip            !== undefined ? input.zip            : existing.zip,
    license_number: input.license_number !== undefined ? input.license_number : existing.license_number,
    phone:          input.phone          !== undefined ? input.phone          : existing.phone,
    mobile_phone:   input.mobile_phone   !== undefined ? input.mobile_phone   : existing.mobile_phone,
    email_notes:    input.email_notes    !== undefined ? input.email_notes    : existing.email_notes,
  };

  // Did any address part change?
  const addressChanged =
    (input.address    !== undefined && input.address    !== existing.address) ||
    (input.address_2  !== undefined && input.address_2  !== existing.address_2) ||
    (input.city       !== undefined && input.city       !== existing.city) ||
    (input.state      !== undefined && input.state      !== existing.state) ||
    (input.zip        !== undefined && input.zip        !== existing.zip);

  // Did the email change?
  const emailChanged =
    input.email !== undefined && input.email !== existing.email;

  const rows = (await sql`
    UPDATE mailing_contacts
       SET first_name             = ${next.first_name},
           last_name              = ${next.last_name},
           title                  = ${next.title},
           email                  = ${next.email},
           company                = ${next.company},
           address                = ${next.address},
           address_2              = ${next.address_2},
           city                   = ${next.city},
           state                  = ${next.state},
           zip                    = ${next.zip},
           license_number         = ${next.license_number},
           phone                  = ${next.phone},
           mobile_phone           = ${next.mobile_phone},
           email_notes            = ${next.email_notes},
           addr_status            = CASE WHEN ${addressChanged} THEN 'Pending' ELSE addr_status END,
           addr_verified_at       = CASE WHEN ${addressChanged} THEN NULL      ELSE addr_verified_at END,
           addr_usps_normalized   = CASE WHEN ${addressChanged} THEN NULL      ELSE addr_usps_normalized END,
           lat                    = CASE WHEN ${addressChanged} THEN NULL      ELSE lat END,
           lon                    = CASE WHEN ${addressChanged} THEN NULL      ELSE lon END,
           geocoded_at            = CASE WHEN ${addressChanged} THEN NULL      ELSE geocoded_at END,
           distance_abor_mi       = CASE WHEN ${addressChanged} THEN NULL      ELSE distance_abor_mi END,
           distance_fivepoints_mi = CASE WHEN ${addressChanged} THEN NULL      ELSE distance_fivepoints_mi END,
           distance_sabor_mi      = CASE WHEN ${addressChanged} THEN NULL      ELSE distance_sabor_mi END,
           email_status           = CASE WHEN ${emailChanged}   THEN 'Pending' ELSE email_status END,
           email_verified_at      = CASE WHEN ${emailChanged}   THEN NULL      ELSE email_verified_at END,
           updated_at             = NOW()
     WHERE id = ${id}
       AND stage = 'holding'
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Persist the result of a USPS address verification on a holding row.
 * Stores the normalized address string and (when Valid) leaves geocoding
 * to a separate step.
 */
export async function persistAddressVerification(
  id: string,
  status: VerifyStatus,
  normalizedAddress: string | null,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE mailing_contacts
       SET addr_status          = ${status},
           addr_verified_at     = NOW(),
           addr_usps_normalized = ${normalizedAddress},
           updated_at           = NOW()
     WHERE id = ${id}
       AND stage = 'holding'
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Stage-agnostic variant of persistAddressVerification. Used by the
 * mailing-stage Verify USPS action on segment views (e.g. Manual
 * Newsline San Antonio Contacts) where rows live in stage='mailing'.
 */
export async function persistAddressVerificationAnyStage(
  id: string,
  status: VerifyStatus,
  normalizedAddress: string | null,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE mailing_contacts
       SET addr_status          = ${status},
           addr_verified_at     = NOW(),
           addr_usps_normalized = ${normalizedAddress},
           updated_at           = NOW()
     WHERE id = ${id}
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Persist a USPS-canonical address back into the holding row's address
 * component fields (address / address_2 / city / state / zip). Called
 * after a successful Valid verdict so the row carries the
 * standardized USPS form rather than whatever the user typed.
 *
 * ZIP is stored as "12345" or "12345-6789" depending on whether USPS
 * returned a ZIP+4. State is always the 2-letter postal code.
 */
export async function persistUspsCanonicalAddress(
  id: string,
  canonical: {
    streetAddress: string;
    secondaryAddress: string | null;
    city: string;
    state: string;
    zip5: string;
    zip4: string | null;
  },
  normalizedOneLine: string,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  const zip = canonical.zip4 ? `${canonical.zip5}-${canonical.zip4}` : canonical.zip5;
  const rows = (await sql`
    UPDATE mailing_contacts
       SET address              = ${canonical.streetAddress},
           address_2            = ${canonical.secondaryAddress},
           city                 = ${canonical.city},
           state                = ${canonical.state},
           zip                  = ${zip},
           addr_status          = 'Valid',
           addr_verified_at     = NOW(),
           addr_usps_normalized = ${normalizedOneLine},
           updated_at           = NOW()
     WHERE id = ${id}
       AND stage = 'holding'
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Stage-agnostic variant of persistUspsCanonicalAddress. Used by the
 * Verify USPS action on the mailing-stage segment views.
 */
export async function persistUspsCanonicalAddressAnyStage(
  id: string,
  canonical: {
    streetAddress: string;
    secondaryAddress: string | null;
    city: string;
    state: string;
    zip5: string;
    zip4: string | null;
  },
  normalizedOneLine: string,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  const zip = canonical.zip4 ? `${canonical.zip5}-${canonical.zip4}` : canonical.zip5;
  const rows = (await sql`
    UPDATE mailing_contacts
       SET address              = ${canonical.streetAddress},
           address_2            = ${canonical.secondaryAddress},
           city                 = ${canonical.city},
           state                = ${canonical.state},
           zip                  = ${zip},
           addr_status          = 'Valid',
           addr_verified_at     = NOW(),
           addr_usps_normalized = ${normalizedOneLine},
           updated_at           = NOW()
     WHERE id = ${id}
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Rich payload from lib/email-verify.ts — kept loose here so this file
 * doesn't take a dep on the verifier module.
 */
export interface EmailVerifyPayload {
  verdict:     'Valid' | 'Invalid' | 'Pending';
  detail:      string;
  risk:        number;
  signals:     {
    syntaxOk:      boolean;
    disposable:    boolean;
    roleAccount:   boolean;
    freeProvider:  boolean;
    hasMx:         boolean;
    smtpConnected: boolean;
    mailboxExists: boolean | null;
    catchAll:      boolean | null;
    smtpTimedOut?: boolean;
    mxAttempts?:   number;
    managedMailProvider?: 'microsoft365-eop' | 'google-workspace' | 'proofpoint' | null;
  };
  mx?:         string;
  code?:       number;
  suggestion?: string;
  normalized?: string;
}

/**
 * Persist the result of an email verification probe on a holding row.
 * The rich `payload` is optional for backwards compatibility — when
 * provided we persist the full structured signals so the UI can render
 * disposable / role / catch-all / suggestion badges.
 */
export async function persistEmailVerification(
  id: string,
  status: VerifyStatus,
  payload?: EmailVerifyPayload,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  if (payload) {
    const s = payload.signals;
    // Auto-append a single timestamped log line to email_notes so the
    // user has a running history of probes. Format:
    //   [2026-05-30 18:30 CDT] Valid — RCPT accepted (250)
    // We use the database's NOW() in CDT-ish ISO format via to_char
    // to keep the line short and human-readable.
    const logLine =
      `${payload.verdict} — ${payload.detail}` +
      (payload.code ? ` [code ${payload.code}]` : '') +
      (s.catchAll ? ' [catch-all]' : '') +
      (s.disposable ? ' [disposable]' : '') +
      (s.smtpTimedOut && !s.smtpConnected ? ' [timed out]' : '') +
      (s.managedMailProvider ? ` [${s.managedMailProvider}]` : '');
    // Idempotency: if the most recent line in email_notes carries the
    // SAME log payload AND was stamped within the last 2 minutes, treat
    // this probe as a no-op rewrite — update the structured columns but
    // skip appending a duplicate line. This protects against fast
    // double-clicks (row button + drawer button, dev StrictMode
    // re-invocation, or accidental client retries).
    const rows = (await sql`
      UPDATE mailing_contacts
         SET email_status        = ${status},
             email_verified_at   = NOW(),
             email_disposable    = ${s.disposable},
             email_role          = ${s.roleAccount},
             email_free_provider = ${s.freeProvider},
             email_catch_all     = ${s.catchAll},
             email_risk          = ${Math.round(payload.risk)},
             email_suggestion    = ${payload.suggestion ?? null},
             email_check         = ${JSON.stringify(payload)}::jsonb,
             email_notes         = CASE
               -- Dedup: if email_notes already ends with this exact log
               -- payload (last line, ignoring its timestamp prefix) AND
               -- we last verified within the past 2 minutes, treat the
               -- re-probe as a no-op append.
               WHEN email_notes IS NOT NULL
                AND email_verified_at IS NOT NULL
                AND email_verified_at > (NOW() - INTERVAL '2 minutes')
                AND RIGHT(email_notes, length(${logLine}::text)) = ${logLine}::text
                  THEN email_notes
               ELSE CONCAT_WS(
                      E'\n',
                      NULLIF(email_notes, ''),
                      CONCAT('[', to_char(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'), '] ', ${logLine}::text)
                    )
             END,
             updated_at          = NOW()
       WHERE id = ${id}
         AND stage = 'holding'
       RETURNING *
    `) as unknown as MailingContactRow[];
    return rows[0] ?? null;
  }
  const rows = (await sql`
    UPDATE mailing_contacts
       SET email_status      = ${status},
           email_verified_at = NOW(),
           updated_at        = NOW()
     WHERE id = ${id}
       AND stage = 'holding'
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

/**
 * Stage-agnostic variant of persistEmailVerification. Identical body but
 * WITHOUT the `AND stage = 'holding'` guard, so it can persist email
 * verification results for rows in any stage (e.g. stage='mailing'
 * segment rows). Used by the stage-agnostic mailing verify-email route.
 */
export async function persistEmailVerificationAnyStage(
  id: string,
  status: VerifyStatus,
  payload?: EmailVerifyPayload,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  if (payload) {
    const s = payload.signals;
    const logLine =
      `${payload.verdict} — ${payload.detail}` +
      (payload.code ? ` [code ${payload.code}]` : '') +
      (s.catchAll ? ' [catch-all]' : '') +
      (s.disposable ? ' [disposable]' : '') +
      (s.smtpTimedOut && !s.smtpConnected ? ' [timed out]' : '') +
      (s.managedMailProvider ? ` [${s.managedMailProvider}]` : '');
    const rows = (await sql`
      UPDATE mailing_contacts
         SET email_status        = ${status},
             email_verified_at   = NOW(),
             email_disposable    = ${s.disposable},
             email_role          = ${s.roleAccount},
             email_free_provider = ${s.freeProvider},
             email_catch_all     = ${s.catchAll},
             email_risk          = ${Math.round(payload.risk)},
             email_suggestion    = ${payload.suggestion ?? null},
             email_check         = ${JSON.stringify(payload)}::jsonb,
             email_notes         = CASE
               WHEN email_notes IS NOT NULL
                AND email_verified_at IS NOT NULL
                AND email_verified_at > (NOW() - INTERVAL '2 minutes')
                AND RIGHT(email_notes, length(${logLine}::text)) = ${logLine}::text
                  THEN email_notes
               ELSE CONCAT_WS(
                      E'\n',
                      NULLIF(email_notes, ''),
                      CONCAT('[', to_char(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'), '] ', ${logLine}::text)
                    )
             END,
             updated_at          = NOW()
       WHERE id = ${id}
       RETURNING *
    `) as unknown as MailingContactRow[];
    return rows[0] ?? null;
  }
  const rows = (await sql`
    UPDATE mailing_contacts
       SET email_status      = ${status},
           email_verified_at = NOW(),
           updated_at        = NOW()
     WHERE id = ${id}
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}

// ============================================================
// Manual email-verification override
// ============================================================

/**
 * Set or clear the manual override of the email verification verdict
 * for a single mailing_contacts row.
 *
 * The override lives in dedicated columns (email_override_status / _by /
 * _at / _reason) and is the "effective" verdict the rest of the app
 * should use — see types.ts. We deliberately do NOT touch email_status
 * here; it stays as the last SMTP-probe result so we can re-probe in the
 * future and surface drift between the technical signal and the manual
 * call.
 *
 * Allowed transitions:
 *   - Pending  → Valid    (the common case — Google Workspace / M365
 *                          block the probe but the address is real)
 *   - Pending  → Invalid  (manually mark a bouncing address invalid)
 *   - Valid    → Invalid  (post-bounce takedown of a previously-valid row)
 *   - any      → null     (clear the override; revert to email_status)
 *
 * Disallowed:
 *   - Invalid  → Valid    (we refuse to manually "un-bounce" a row; if
 *                          it really is good, re-probe it instead)
 *
 * Caller is responsible for `requireAdmin()` and for passing the admin's
 * email as `by`. The transition rule above is enforced here (it returns
 * `null` for a disallowed transition so the route layer can map that to
 * a 409 Conflict response).
 *
 * The override action is also appended to email_notes as a timestamped
 * audit line, so the running notes journal carries the manual record
 * alongside the auto-appended probe lines.
 */
export interface OverrideInput {
  status: 'Valid' | 'Invalid' | null;
  by:     string;
  reason: string | null;
}

export type OverrideOutcome =
  | { ok: true;  row: MailingContactRow }
  | { ok: false; code: 'not_found' | 'forbidden_transition'; message: string };

export async function persistEmailOverride(
  id: string,
  input: OverrideInput,
): Promise<OverrideOutcome> {
  const sql = getSql();

  // Read the existing row so we can validate the transition and build a
  // descriptive audit line.
  const existingRows = (await sql`
    SELECT * FROM mailing_contacts WHERE id = ${id}
  `) as unknown as MailingContactRow[];
  const existing = existingRows[0];
  if (!existing) {
    return { ok: false, code: 'not_found', message: 'Contact not found.' };
  }

  // Enforce the one-way rule: a probe-Invalid row can't be flipped to Valid.
  // The user must re-probe to clear the Invalid signal.
  if (input.status === 'Valid' && existing.email_status === 'Invalid') {
    return {
      ok: false,
      code: 'forbidden_transition',
      message:
        "Can't override Invalid to Valid manually. Re-run the verifier first; if the probe now succeeds, the row will become Valid on its own.",
    };
  }

  // Build the audit line. For sets we include the new verdict + reason;
  // for clears we just record that the override was lifted.
  const auditLine =
    input.status === null
      ? `Manual override cleared by ${input.by}`
      : `Manual override: ${input.status} by ${input.by}` +
        (input.reason ? ` — ${input.reason}` : '');

  // Bind a sentinel so we can branch the `email_override_at` column
  // between NOW() and NULL with a single statement — the neon serverless
  // `sql` tagged template doesn't support nested raw-SQL fragments.
  const isClear = input.status === null;
  const overrideBy = isClear ? null : input.by;
  const overrideReason = isClear ? null : input.reason;

  const rows = (await sql`
    UPDATE mailing_contacts
       SET email_override_status = ${input.status},
           email_override_by     = ${overrideBy},
           email_override_at     = CASE WHEN ${isClear} THEN NULL ELSE NOW() END,
           email_override_reason = ${overrideReason},
           email_notes           = CONCAT_WS(
             E'\n',
             NULLIF(email_notes, ''),
             CONCAT('[', to_char(NOW() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'), '] ', ${auditLine}::text)
           ),
           updated_at            = NOW()
     WHERE id = ${id}
     RETURNING *
  `) as unknown as MailingContactRow[];

  const updated = rows[0];
  if (!updated) return { ok: false, code: 'not_found', message: 'Contact not found.' };
  return { ok: true, row: updated };
}

/**
 * Persist a successful geocode (lat/lon + pre-computed distances).
 */
export async function persistGeocode(
  id: string,
  lat: number,
  lon: number,
  distAbor: number,
  distFivePoints: number,
  distSabor: number = 0,
): Promise<MailingContactRow | null> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE mailing_contacts
       SET lat                    = ${lat},
           lon                    = ${lon},
           geocoded_at            = NOW(),
           distance_abor_mi       = ${distAbor},
           distance_fivepoints_mi = ${distFivePoints},
           distance_sabor_mi      = ${distSabor},
           updated_at             = NOW()
     WHERE id = ${id}
     RETURNING *
  `) as unknown as MailingContactRow[];
  return rows[0] ?? null;
}
