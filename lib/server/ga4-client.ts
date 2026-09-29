// lib/server/ga4-client.ts
//
// Google Analytics 4 connection for /admin/marketing-performance.
//
// Reuses the app's existing Google OAuth client (GOOGLE_OAUTH_CLIENT_ID /
// GOOGLE_OAUTH_CLIENT_SECRET, same one the Gmail scanner uses) with the
// analytics.readonly scope. The admin connects once from the dashboard; the
// refresh token and the selected GA4 property live in `ga4_oauth_tokens`.
//
// Redirect URI: <origin>/api/admin/ga4-auth/callback — it must be listed
// under "Authorized redirect URIs" on the OAuth client in Google Cloud, and
// the Google Analytics Data API + Admin API must be enabled on that project.

import { google } from 'googleapis';
import { query } from './db/neon';
import { logger } from './logger';

type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export interface Ga4Connection {
  emailAddress: string;
  /** Comma-separated GA4 property IDs. */
  propertyId: string | null;
  propertyName: string | null;
  updatedAt: string | null;
}

interface TokenRow {
  email_address: string;
  access_token: string | null;
  refresh_token: string;
  token_expiry: string | Date | null;
  scope: string;
  property_id: string | null;
  property_name: string | null;
  updated_at: string | Date | null;
}

let schemaReady: Promise<void> | null = null;
export function ensureGa4Schema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = query(`
      CREATE TABLE IF NOT EXISTS ga4_oauth_tokens (
        id            SERIAL PRIMARY KEY,
        email_address TEXT NOT NULL UNIQUE,
        access_token  TEXT,
        refresh_token TEXT NOT NULL,
        token_expiry  TIMESTAMPTZ,
        scope         TEXT NOT NULL,
        property_id   TEXT,
        property_name TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => undefined).catch((err) => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

export function isGa4OAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

export function ga4RedirectUri(origin: string): string {
  const explicit = process.env.GA4_OAUTH_REDIRECT_URI;
  if (explicit) return explicit;
  return `${origin.replace(/\/$/, '')}/api/admin/ga4-auth/callback`;
}

function createClient(redirectUri?: string): OAuth2Client {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth is not configured: set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGa4ConsentUrl(origin: string, state: string): string {
  return createClient(ga4RedirectUri(origin)).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: false,
    scope: [GA4_SCOPE, 'openid', 'email'],
    state,
  });
}

export async function exchangeGa4Code(origin: string, code: string): Promise<void> {
  const client = createClient(ga4RedirectUri(origin));
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('Google returned no refresh token. Remove the app under Google Account → Security → Third-party access, then reconnect.');
  }
  client.setCredentials(tokens);
  const info = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  const email = info.data.email;
  if (!email) throw new Error('Could not read the connected Google account email.');

  await ensureGa4Schema();
  // One GA4 connection at a time: replace whatever was there.
  await query(`DELETE FROM ga4_oauth_tokens WHERE email_address <> $1`, [email]);
  await query(
    `INSERT INTO ga4_oauth_tokens (email_address, access_token, refresh_token, token_expiry, scope, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email_address) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       token_expiry = EXCLUDED.token_expiry,
       scope = EXCLUDED.scope,
       updated_at = NOW()`,
    [email, tokens.access_token ?? null, tokens.refresh_token, tokens.expiry_date ? new Date(tokens.expiry_date) : null, tokens.scope ?? GA4_SCOPE],
  );
}

async function loadRow(): Promise<TokenRow | null> {
  await ensureGa4Schema();
  const rows = await query<TokenRow>(
    `SELECT email_address, access_token, refresh_token, token_expiry, scope, property_id, property_name, updated_at
       FROM ga4_oauth_tokens ORDER BY updated_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function getGa4Connection(): Promise<Ga4Connection | null> {
  const row = await loadRow();
  if (!row) return null;
  return {
    emailAddress: row.email_address,
    propertyId: row.property_id,
    propertyName: row.property_name,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

async function authedClient(): Promise<{ client: OAuth2Client; row: TokenRow } | null> {
  const row = await loadRow();
  if (!row) return null;
  const client = createClient();
  client.setCredentials({
    access_token: row.access_token ?? undefined,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
    scope: row.scope,
  });
  client.on('tokens', (t) => {
    if (!t.access_token) return;
    void query(
      `UPDATE ga4_oauth_tokens SET access_token = $1, token_expiry = $2, updated_at = NOW() WHERE email_address = $3`,
      [t.access_token, t.expiry_date ? new Date(t.expiry_date) : null, row.email_address],
    ).catch((err) => logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[ga4] token persist failed'));
  });
  return { client, row };
}

export async function listGa4Properties(): Promise<Array<{ id: string; name: string; account: string }>> {
  const auth = await authedClient();
  if (!auth) return [];
  const admin = google.analyticsadmin({ version: 'v1beta', auth: auth.client });
  const out: Array<{ id: string; name: string; account: string }> = [];
  let pageToken: string | undefined;
  do {
    const res = await admin.accountSummaries.list({ pageSize: 200, pageToken });
    for (const acct of res.data.accountSummaries ?? []) {
      for (const p of acct.propertySummaries ?? []) {
        const id = (p.property ?? '').replace('properties/', '');
        if (id) out.push({ id, name: p.displayName ?? id, account: acct.displayName ?? '' });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/**
 * Save the GA4 properties the dashboard reports on. Stored comma-separated in
 * property_id / property_name (e.g. RealtyLine.us + Newsline San Antonio);
 * the dashboard sums them. Empty list clears the selection.
 */
export async function selectGa4Properties(props: Array<{ id: string; name: string }>): Promise<void> {
  await ensureGa4Schema();
  const ids = props.map((p) => p.id).join(',') || null;
  const names = props.map((p) => p.name.replace(/,/g, ' ')).join(', ') || null;
  await query(`UPDATE ga4_oauth_tokens SET property_id = $1, property_name = $2, updated_at = NOW()`, [ids, names]);
}

export async function disconnectGa4(): Promise<void> {
  await ensureGa4Schema();
  await query(`DELETE FROM ga4_oauth_tokens`);
}

export interface Ga4MonthRow { month: string; channelGroup: string; sessions: number; pageviews: number; keyEvents: number }

/** Monthly sessions / pageviews / key events by default channel group. */
export async function fetchGa4Monthly(startDate: string): Promise<{ propertyName: string | null; rows: Ga4MonthRow[] } | null> {
  const auth = await authedClient();
  if (!auth || !auth.row.property_id) return null;
  const data = google.analyticsdata({ version: 'v1beta', auth: auth.client });
  const ids = auth.row.property_id.split(',').map((x) => x.trim()).filter(Boolean);
  const reports = await Promise.all(ids.map((id) => data.properties.runReport({
    property: `properties/${id}`,
    requestBody: {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'yearMonth' }, { name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'screenPageViews' }, { name: 'keyEvents' }],
      limit: '10000',
    },
  })));
  const rows: Ga4MonthRow[] = reports.flatMap((res) => res.data.rows ?? []).map((r) => {
    const ym = r.dimensionValues?.[0]?.value ?? '';
    return {
      month: `${ym.slice(0, 4)}-${ym.slice(4, 6)}`,
      channelGroup: r.dimensionValues?.[1]?.value ?? '',
      sessions: Number(r.metricValues?.[0]?.value) || 0,
      pageviews: Number(r.metricValues?.[1]?.value) || 0,
      keyEvents: Number(r.metricValues?.[2]?.value) || 0,
    };
  });
  return { propertyName: auth.row.property_name, rows };
}
