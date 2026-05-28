/**
 * WebAuthn credential + challenge store — DO Postgres (transient).
 *
 * The schema lives in DO Postgres alongside `realtors`. After the Neon
 * migration these calls switch to `getPool()` from `db/neon.ts`.
 *
 * Tables:
 *   webauthn_credentials — registered passkeys, FK realtor_id
 *   webauthn_challenges  — short-lived (5 min) one-time challenges
 */

import type { PoolClient } from '@neondatabase/serverless';
import { query, exec, withNeonTransaction } from './db/neon';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface RealtorIdentityRow {
  email: string;
  first_name: string;
  last_name: string;
}

export interface ExistingCredentialRow {
  credential_id: string;
  transports: string[];
}

export interface ChallengeRow {
  id: string;
  challenge: string;
}

export interface StoredCredentialRow {
  id: string;
  realtor_id: string;
  public_key: Buffer;
  counter: string;
  transports: string[];
}

export interface CredentialListRow {
  id: string;
  device_name: string | null;
  authenticator_type: string | null;
  created_at: Date;
  last_used_at: Date | null;
}

// -----------------------------------------------------------------------------
// Reads (non-tx)
// -----------------------------------------------------------------------------

export async function getRealtorIdentity(
  realtorId: string,
): Promise<RealtorIdentityRow | null> {
  const rows = await query<RealtorIdentityRow>(
    `SELECT email, first_name, last_name FROM realtors WHERE id = $1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export async function listExistingCredentials(
  realtorId: string,
): Promise<ExistingCredentialRow[]> {
  return query<ExistingCredentialRow>(
    `SELECT credential_id, transports FROM webauthn_credentials WHERE realtor_id = $1`,
    [realtorId],
  );
}

export async function lookupCredentialsForEmail(
  email: string,
): Promise<{ realtorId: string; credentials: ExistingCredentialRow[] } | null> {
  const rows = await query<{
    id: string;
    credential_id: string;
    transports: string[];
  }>(
    `SELECT r.id, c.credential_id, c.transports
     FROM realtors r
     JOIN webauthn_credentials c ON c.realtor_id = r.id
     WHERE r.email = $1`,
    [email],
  );
  if (rows.length === 0) return null;
  return {
    realtorId: rows[0]!.id,
    credentials: rows.map((row) => ({
      credential_id: row.credential_id,
      transports: row.transports,
    })),
  };
}

export async function insertChallenge(
  realtorId: string | null,
  challenge: string,
  purpose: 'registration' | 'authentication',
  expiresMs: number,
  ipAddress: string | null,
  userAgent: string | null,
): Promise<void> {
  await query(
    `INSERT INTO webauthn_challenges
       (realtor_id, challenge, purpose, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3,
             NOW() + ($4 || ' milliseconds')::interval,
             $5, $6)`,
    [realtorId, challenge, purpose, String(expiresMs), ipAddress, userAgent],
  );
}

export async function listCredentials(
  realtorId: string,
): Promise<CredentialListRow[]> {
  return query<CredentialListRow>(
    `SELECT id, device_name, authenticator_type, created_at, last_used_at
     FROM webauthn_credentials
     WHERE realtor_id = $1
     ORDER BY created_at DESC`,
    [realtorId],
  );
}

export async function deleteCredential(
  realtorId: string,
  credentialId: string,
): Promise<number> {
  const { rowCount } = await exec(
    `DELETE FROM webauthn_credentials WHERE id = $1 AND realtor_id = $2`,
    [credentialId, realtorId],
  );
  return rowCount;
}

// -----------------------------------------------------------------------------
// Transactional helpers
// -----------------------------------------------------------------------------

export async function lockOpenChallengeForRegistrationTx(
  client: PoolClient,
  realtorId: string,
): Promise<ChallengeRow | null> {
  const { rows } = await client.query<ChallengeRow>(
    `SELECT id, challenge
     FROM webauthn_challenges
     WHERE realtor_id = $1
       AND purpose = 'registration'
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export async function lockOpenChallengeForAuthTx(
  client: PoolClient,
  realtorId: string,
): Promise<ChallengeRow | null> {
  const { rows } = await client.query<ChallengeRow>(
    `SELECT id, challenge
     FROM webauthn_challenges
     WHERE purpose = 'authentication'
       AND consumed_at IS NULL
       AND expires_at > NOW()
       AND (realtor_id IS NULL OR realtor_id = $1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export async function insertCredentialTx(
  client: PoolClient,
  params: {
    realtorId: string;
    credentialId: string;
    publicKey: Buffer;
    counter: number;
    transports: string[];
    deviceName: string | null;
    authenticatorType: 'platform' | 'cross-platform' | null;
  },
): Promise<{ id: string; createdAt: Date }> {
  const { rows } = await client.query<{ id: string; created_at: Date }>(
    `INSERT INTO webauthn_credentials
       (realtor_id, credential_id, public_key, counter, transports, device_name, authenticator_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, created_at`,
    [
      params.realtorId,
      params.credentialId,
      params.publicKey,
      params.counter,
      params.transports,
      params.deviceName,
      params.authenticatorType,
    ],
  );
  return { id: rows[0]!.id, createdAt: rows[0]!.created_at };
}

export async function lookupCredentialTx(
  client: PoolClient,
  credentialId: string,
): Promise<StoredCredentialRow | null> {
  const { rows } = await client.query<StoredCredentialRow>(
    `SELECT id, realtor_id, public_key, counter, transports
     FROM webauthn_credentials
     WHERE credential_id = $1`,
    [credentialId],
  );
  return rows[0] ?? null;
}

export async function consumeChallengeTx(
  client: PoolClient,
  challengeId: string,
): Promise<void> {
  await client.query(
    `UPDATE webauthn_challenges SET consumed_at = NOW() WHERE id = $1`,
    [challengeId],
  );
}

export async function updateCounterTx(
  client: PoolClient,
  credentialRowId: string,
  newCounter: number,
): Promise<void> {
  await client.query(
    `UPDATE webauthn_credentials
     SET counter = $1, last_used_at = NOW()
     WHERE id = $2`,
    [newCounter, credentialRowId],
  );
}

export async function touchLastUsedTx(
  client: PoolClient,
  credentialRowId: string,
): Promise<void> {
  await client.query(
    `UPDATE webauthn_credentials SET last_used_at = NOW() WHERE id = $1`,
    [credentialRowId],
  );
}

export async function bumpRealtorLoginTx(
  client: PoolClient,
  realtorId: string,
): Promise<{ email: string } | null> {
  const { rows } = await client.query<{ email: string }>(
    `UPDATE realtors SET last_login_at = NOW() WHERE id = $1 RETURNING email`,
    [realtorId],
  );
  return rows[0] ?? null;
}

export { withNeonTransaction };
