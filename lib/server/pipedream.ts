const API = 'https://api.pipedream.com/v1';

export type ConnectedAccount = { id: string; appSlug: string; appName: string; healthy: boolean };

export function pipedreamConfigured(): boolean {
  return Boolean(process.env.PIPEDREAM_CLIENT_ID && process.env.PIPEDREAM_CLIENT_SECRET && process.env.PIPEDREAM_PROJECT_ID);
}

const environment = () => (process.env.PIPEDREAM_ENVIRONMENT === 'development' ? 'development' : 'production');
export const externalUserId = (realtorId: string) => `rl_${realtorId}`;

let cached: { token: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: process.env.PIPEDREAM_CLIENT_ID, client_secret: process.env.PIPEDREAM_CLIENT_SECRET }),
  });
  if (!res.ok) throw new Error(`Integration service sign-in failed (${res.status})`);
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cached = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  return fetch(`${API}/connect/${process.env.PIPEDREAM_PROJECT_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'x-pd-environment': environment(), 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

/** Single-use link that opens the provider's sign-in for this agent only. */
export async function createConnectLink(realtorId: string, appSlug: string, origin: string): Promise<string> {
  const res = await call('/tokens', {
    method: 'POST',
    body: JSON.stringify({ external_user_id: externalUserId(realtorId), success_redirect_uri: `${origin}/agents/closing-time?integration=connected`, error_redirect_uri: `${origin}/agents/closing-time?integration=error` }),
  });
  if (!res.ok) throw new Error(`Could not start the connection (${res.status})`);
  const body = (await res.json()) as { connect_link_url: string };
  const url = new URL(body.connect_link_url);
  url.searchParams.set('app', appSlug);
  return url.toString();
}

export async function listAccounts(realtorId: string): Promise<ConnectedAccount[]> {
  const res = await call(`/accounts?external_user_id=${encodeURIComponent(externalUserId(realtorId))}&limit=100`);
  if (!res.ok) throw new Error(`Could not load connections (${res.status})`);
  const body = (await res.json()) as { data: { id: string; healthy?: boolean; dead?: boolean | null; app?: { name_slug?: string; name?: string } }[] };
  return body.data.filter((a) => !a.dead).map((a) => ({ id: a.id, appSlug: a.app?.name_slug ?? '', appName: a.app?.name ?? '', healthy: a.healthy !== false }));
}

export async function disconnectAccount(realtorId: string, accountId: string): Promise<void> {
  const owned = (await listAccounts(realtorId)).some((a) => a.id === accountId);
  if (!owned) throw new Error('Connection not found');
  const res = await call(`/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Could not disconnect (${res.status})`);
}
