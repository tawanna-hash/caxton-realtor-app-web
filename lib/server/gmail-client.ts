/**
 * Google OAuth + authenticated Gmail v1 client for the event scanner.
 *
 * One mailbox is connected at a time (Tawanna's). The consent screen is
 * launched from /api/admin/gmail-auth/start and the grant is stored in
 * `gmail_oauth_tokens` by /api/admin/gmail-auth/callback.
 *
 * Only the refresh token is load-bearing. The access token is a cache: the
 * OAuth2 client refreshes it on expiry and we persist the new one via the
 * library's `tokens` event so warm instances don't each re-refresh.
 *
 * Scope is gmail.readonly — the scanner never sends, labels, or deletes.
 * users.getProfile (used to learn which mailbox was connected) is covered by
 * that same scope, so no extra consent is required.
 */

import { google } from 'googleapis';
import type { gmail_v1 } from 'googleapis';
import { query } from './db/neon';
import { logger } from './logger';

// googleapis-common bundles its own nested copy of google-auth-library, so
// importing OAuth2Client from the top-level package yields a structurally
// identical but nominally incompatible type. Deriving it from the class
// googleapis actually hands us keeps `google.gmail({ auth })` type-checking.
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface ConnectedMailbox {
  emailAddress: string;
  scope: string;
  updatedAt: string | null;
}

interface TokenRow {
  email_address: string;
  access_token: string | null;
  refresh_token: string;
  token_expiry: string | Date | null;
  scope: string;
  updated_at: string | Date | null;
}

function toIso(v: string | Date | null): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * Redirect URI registered in Google Cloud Console. Explicit env var wins so
 * preview deployments can point at a stable authorized URI; otherwise derive
 * it from the site URL the rest of the app already uses for absolute links.
 */
function getOAuthRedirectUri(): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) {
    throw new Error(
      'Gmail OAuth is not configured: set GOOGLE_OAUTH_REDIRECT_URI (or NEXT_PUBLIC_SITE_URL).',
    );
  }
  return `${base.replace(/\/$/, '')}/api/admin/gmail-auth/callback`;
}

function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Gmail OAuth is not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.',
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getOAuthRedirectUri());
}

/** True when the OAuth client env vars are present. */
export function isGmailOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

/**
 * Google consent URL. `access_type=offline` + `prompt=consent` are both
 * required: without them a re-authorization of an already-granted account
 * returns no refresh token, which would leave us unable to scan once the
 * access token expires.
 */
export function buildConsentUrl(state?: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [GMAIL_SCOPE],
    state,
  });
}

/**
 * Exchange the callback `code` for tokens and resolve which mailbox was
 * actually connected (the admin may pick a different Google account on the
 * consent screen than the one they intended).
 */
export async function exchangeCodeForMailbox(code: string): Promise<{
  emailAddress: string;
  accessToken: string | null;
  refreshToken: string;
  expiryDate: Date | null;
  scope: string;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google returned no refresh token. Revoke the app under Google Account → ' +
      'Security → Third-party access and reconnect.',
    );
  }
  client.setCredentials(tokens);

  const gmail = google.gmail({ version: 'v1', auth: client });
  const profile = await gmail.users.getProfile({ userId: 'me' });
  const emailAddress = profile.data.emailAddress;
  if (!emailAddress) throw new Error('Could not read the connected mailbox address from Gmail.');

  return {
    emailAddress,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? GMAIL_SCOPE,
  };
}

/**
 * Persist a grant. Keyed on email_address so reconnecting the same mailbox
 * replaces the old refresh token instead of accumulating dead rows.
 */
export async function saveGmailTokens(input: {
  emailAddress: string;
  accessToken: string | null;
  refreshToken: string;
  expiryDate: Date | null;
  scope: string;
}): Promise<void> {
  await query(
    `INSERT INTO gmail_oauth_tokens
       (email_address, access_token, refresh_token, token_expiry, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email_address) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expiry  = EXCLUDED.token_expiry,
       scope         = EXCLUDED.scope,
       updated_at    = NOW()`,
    [
      input.emailAddress,
      input.accessToken,
      input.refreshToken,
      input.expiryDate,
      input.scope,
    ],
  );
}

async function loadTokenRow(): Promise<TokenRow | null> {
  const rows = await query<TokenRow>(
    `SELECT email_address, access_token, refresh_token, token_expiry, scope, updated_at
       FROM gmail_oauth_tokens
      ORDER BY updated_at DESC
      LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** The mailbox the scanner will read, or null when nothing is connected. */
export async function getConnectedMailbox(): Promise<ConnectedMailbox | null> {
  const row = await loadTokenRow();
  if (!row) return null;
  return {
    emailAddress: row.email_address,
    scope: row.scope,
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Authenticated Gmail v1 client for the connected mailbox, or null when no
 * mailbox has been connected yet (callers surface a "Connect Gmail" prompt
 * rather than erroring).
 */
export async function getGmailClient(): Promise<{
  gmail: gmail_v1.Gmail;
  emailAddress: string;
} | null> {
  const row = await loadTokenRow();
  if (!row) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
    scope: row.scope,
  });

  // Fired whenever the library silently refreshes the access token. Persisting
  // it here keeps the next cold start from burning an extra refresh call.
  client.on('tokens', (tokens) => {
    if (!tokens.access_token) return;
    void query(
      `UPDATE gmail_oauth_tokens
          SET access_token = $1, token_expiry = $2, updated_at = NOW()
        WHERE email_address = $3`,
      [
        tokens.access_token,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        row.email_address,
      ],
    ).catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        '[gmail-client] failed to persist refreshed access token',
      );
    });
  });

  return {
    gmail: google.gmail({ version: 'v1', auth: client }),
    emailAddress: row.email_address,
  };
}
