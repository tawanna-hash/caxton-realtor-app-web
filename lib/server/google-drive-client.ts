/**
 * Per-agent Google OAuth + authenticated Drive v3 client.
 *
 * Unlike gmail-client.ts (one shared admin mailbox), every realtor connects
 * their own Google Drive from their account settings. The consent screen is
 * launched from /api/agents/drive-auth/start and the grant is stored in
 * `agent_drive_connections`, keyed on realtor_id, by
 * /api/agents/drive-auth/callback.
 *
 * Only the refresh token is load-bearing. The access token is a cache: the
 * OAuth2 client refreshes it on expiry and we persist the new one via the
 * library's `tokens` event so warm instances don't each re-refresh.
 *
 * Scope is drive.file — the app only sees/manages files and folders it
 * itself creates in the agent's Drive, never the agent's whole Drive.
 */

import { Readable } from 'node:stream';
import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';
import { query } from './db/neon';
import { logger } from './logger';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const APP_FOLDER_NAME = 'Realty News Now Closing Time';

export interface ConnectedDrive {
  googleEmail: string;
  scope: string;
  folderId: string | null;
  updatedAt: string | null;
}

interface TokenRow {
  realtor_id: string;
  google_email: string;
  access_token: string | null;
  refresh_token: string;
  token_expiry: string | Date | null;
  scope: string;
  folder_id: string | null;
  updated_at: string | Date | null;
}

function toIso(v: string | Date | null): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

let schemaPromise: Promise<void> | null = null;

export function ensureAgentDriveConnectionsSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS agent_drive_connections (
        realtor_id UUID PRIMARY KEY REFERENCES realtors(id) ON DELETE CASCADE,
        google_email TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT NOT NULL,
        token_expiry TIMESTAMPTZ,
        scope TEXT NOT NULL,
        folder_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

/**
 * Redirect URI registered in Google Cloud Console. Explicit env var wins so
 * preview deployments can point at a stable authorized URI; otherwise derive
 * it from the site URL the rest of the app already uses for absolute links.
 */
function getOAuthRedirectUri(): string {
  const explicit = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) {
    throw new Error(
      'Google Drive OAuth is not configured: set GOOGLE_DRIVE_REDIRECT_URI (or NEXT_PUBLIC_SITE_URL).',
    );
  }
  return `${base.replace(/\/$/, '')}/api/agents/drive-auth/callback`;
}

function createOAuthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google Drive OAuth is not configured: set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET.',
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getOAuthRedirectUri());
}

/** True when the OAuth client env vars are present. */
export function isDriveOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET);
}

/**
 * Google consent URL, scoped to one realtor via `state`. `access_type=offline`
 * + `prompt=consent` are both required: without them a re-authorization of an
 * already-granted account returns no refresh token, which would leave us
 * unable to upload once the access token expires.
 */
export function buildDriveConsentUrl(state: string): string {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [DRIVE_SCOPE, USERINFO_EMAIL_SCOPE],
    state,
  });
}

/**
 * Exchange the callback `code` for tokens and resolve which Google account
 * was actually connected (the agent may pick a different Google account on
 * the consent screen than the one they intended).
 */
export async function exchangeCodeForDriveAccount(code: string): Promise<{
  googleEmail: string;
  accessToken: string | null;
  refreshToken: string;
  expiryDate: Date | null;
  scope: string;
}> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google returned no refresh token. Revoke the app under Google Account -> ' +
      'Security -> Third-party access and reconnect.',
    );
  }
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  const userinfo = await oauth2.userinfo.get();
  const googleEmail = userinfo.data.email;
  if (!googleEmail) throw new Error('Could not read the connected Google account email.');

  return {
    googleEmail,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    scope: tokens.scope ?? DRIVE_SCOPE,
  };
}

/**
 * Persist a grant for one realtor. Keyed on realtor_id so reconnecting (or
 * switching Google accounts) replaces the old refresh token instead of
 * accumulating dead rows.
 */
export async function saveDriveTokens(input: {
  realtorId: string;
  googleEmail: string;
  accessToken: string | null;
  refreshToken: string;
  expiryDate: Date | null;
  scope: string;
}): Promise<void> {
  await ensureAgentDriveConnectionsSchema();
  await query(
    `INSERT INTO agent_drive_connections
       (realtor_id, google_email, access_token, refresh_token, token_expiry, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (realtor_id) DO UPDATE SET
       google_email  = EXCLUDED.google_email,
       access_token  = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expiry  = EXCLUDED.token_expiry,
       scope         = EXCLUDED.scope,
       updated_at    = NOW()`,
    [
      input.realtorId,
      input.googleEmail,
      input.accessToken,
      input.refreshToken,
      input.expiryDate,
      input.scope,
    ],
  );
}

/** Disconnects one realtor's Drive; safe to call even if nothing is connected. */
export async function disconnectDrive(realtorId: string): Promise<void> {
  await ensureAgentDriveConnectionsSchema();
  await query('DELETE FROM agent_drive_connections WHERE realtor_id = $1', [realtorId]);
}

async function loadTokenRow(realtorId: string): Promise<TokenRow | null> {
  await ensureAgentDriveConnectionsSchema();
  const rows = await query<TokenRow>(
    `SELECT realtor_id, google_email, access_token, refresh_token, token_expiry, scope, folder_id, updated_at
       FROM agent_drive_connections
      WHERE realtor_id = $1
      LIMIT 1`,
    [realtorId],
  );
  return rows[0] ?? null;
}

/** The Drive account connected for this realtor, or null when none is connected. */
export async function getConnectedDrive(realtorId: string): Promise<ConnectedDrive | null> {
  const row = await loadTokenRow(realtorId);
  if (!row) return null;
  return {
    googleEmail: row.google_email,
    scope: row.scope,
    folderId: row.folder_id,
    updatedAt: toIso(row.updated_at),
  };
}

/**
 * Authenticated Drive v3 client for one realtor, or null when they haven't
 * connected Google Drive yet (callers surface a "Connect Google Drive"
 * prompt rather than erroring).
 */
async function getDriveClientForRealtor(realtorId: string): Promise<{
  drive: drive_v3.Drive;
  row: TokenRow;
} | null> {
  const row = await loadTokenRow(realtorId);
  if (!row) return null;

  const client = createOAuthClient();
  client.setCredentials({
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
    scope: row.scope,
  });

  // Fired whenever the library silently refreshes the access token. Persisting
  // it here keeps the next call from burning an extra refresh round-trip.
  client.on('tokens', (tokens) => {
    if (!tokens.access_token) return;
    void query(
      `UPDATE agent_drive_connections
          SET access_token = $1, token_expiry = $2, updated_at = NOW()
        WHERE realtor_id = $3`,
      [
        tokens.access_token,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        row.realtor_id,
      ],
    ).catch((err) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        '[google-drive-client] failed to persist refreshed access token',
      );
    });
  });

  return { drive: google.drive({ version: 'v3', auth: client }), row };
}

/**
 * Finds (or creates, on first use) the realtor's "Realty News Now Closing Time"
 * folder in their connected Drive and persists its id for reuse.
 */
async function ensureAppFolder(drive: drive_v3.Drive, row: TokenRow): Promise<string> {
  if (row.folder_id) return row.folder_id;

  const existing = await drive.files.list({
    q: `name = '${APP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });
  const foundId = existing.data.files?.[0]?.id;

  const folderId = foundId ?? (await drive.files.create({
    requestBody: {
      name: APP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })).data.id;

  if (!folderId) throw new Error('Google Drive did not return a folder id.');

  await query(
    'UPDATE agent_drive_connections SET folder_id = $1, updated_at = NOW() WHERE realtor_id = $2',
    [folderId, row.realtor_id],
  );
  return folderId;
}

/**
 * Finds (or creates) a named subfolder inside the app's Drive folder.
 * Used to keep one deal's document uploads grouped together.
 */
async function ensureSubfolder(drive: drive_v3.Drive, parentId: string, name: string): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `name = '${safeName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  });
  const foundId = existing.data.files?.[0]?.id;
  if (foundId) return foundId;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  if (!created.data.id) throw new Error('Google Drive did not return a subfolder id.');
  return created.data.id;
}

/**
 * Uploads (or overwrites, by filename, within the app folder) one file to
 * the realtor's connected Drive. Silent no-op when nothing is connected —
 * callers treat Drive backup as best-effort, never blocking the local
 * download the export already produced.
 *
 * Pass `subfolder` to group the file inside a named subfolder of the app
 * folder (e.g. one subfolder per deal for document checklist uploads).
 */
export async function uploadFileToDrive(
  realtorId: string,
  filename: string,
  mimeType: string,
  content: Buffer,
  subfolder?: string,
): Promise<{ uploaded: boolean; reason?: string; fileId?: string }> {
  try {
    const client = await getDriveClientForRealtor(realtorId);
    if (!client) return { uploaded: false, reason: 'not_connected' };

    const { drive, row } = client;
    let folderId = await ensureAppFolder(drive, row);
    if (subfolder) folderId = await ensureSubfolder(drive, folderId, subfolder);

    const existing = await drive.files.list({
      q: `name = '${filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    });
    const existingId = existing.data.files?.[0]?.id;

    const media = { mimeType, body: bufferToStream(content) };

    let fileId: string | null | undefined = existingId;
    if (existingId) {
      await drive.files.update({ fileId: existingId, media });
    } else {
      const created = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media,
        fields: 'id',
      });
      fileId = created.data.id;
    }
    return { uploaded: true, fileId: fileId ?? undefined };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), realtorId, filename },
      '[google-drive-client] upload failed',
    );
    return { uploaded: false, reason: 'upload_error' };
  }
}

/**
 * Downloads one file's bytes back from the realtor's connected Drive by
 * file id. Used to re-assemble uploaded checklist documents into a zip.
 * Returns null when Drive isn't connected, the file is gone, or the fetch
 * fails — callers should treat a missing file as "not attached" rather
 * than a hard error.
 */
export async function downloadFileFromDrive(
  realtorId: string,
  fileId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const client = await getDriveClientForRealtor(realtorId);
    if (!client) return null;
    const { drive } = client;

    const [metaRes, contentRes] = await Promise.all([
      drive.files.get({ fileId, fields: 'mimeType' }),
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' }),
    ]);
    const buffer = Buffer.from(contentRes.data as ArrayBuffer);
    return { buffer, mimeType: metaRes.data.mimeType ?? 'application/octet-stream' };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), realtorId, fileId },
      '[google-drive-client] download failed',
    );
    return null;
  }
}

function bufferToStream(buffer: Buffer): NodeJS.ReadableStream {
  return Readable.from(buffer);
}
