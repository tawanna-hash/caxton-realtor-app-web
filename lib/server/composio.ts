const ORIGIN = 'https://backend.composio.dev';

export type ConnectedAccount = { id: string; appSlug: string; appName: string; healthy: boolean };

/** App key used by the Agent Desk -> Composio toolkit slug and display name. */
export const APPS: Record<string, { toolkit: string; name: string }> = {
  google_calendar: { toolkit: 'googlecalendar', name: 'Google Calendar' },
  outlook: { toolkit: 'outlook', name: 'Outlook' },
  gmail: { toolkit: 'gmail', name: 'Gmail' },
  google_drive: { toolkit: 'googledrive', name: 'Google Drive' },
  dropbox: { toolkit: 'dropbox', name: 'Dropbox' },
  microsoft_onedrive: { toolkit: 'one_drive', name: 'OneDrive' },
  slack: { toolkit: 'slack', name: 'Slack' },
  dotloop: { toolkit: 'dotloop', name: 'Dotloop' },
};
const byToolkit = (toolkit: string) => Object.entries(APPS).find(([, v]) => v.toolkit === toolkit)?.[0] ?? '';

export function composioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

export const externalUserId = (realtorId: string) => `rl_${realtorId}`;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${ORIGIN}${path}`, { ...init, headers: { 'x-api-key': process.env.COMPOSIO_API_KEY ?? '', 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
}

const authConfigCache = new Map<string, string>();

async function authConfigFor(toolkit: string): Promise<string> {
  const hit = authConfigCache.get(toolkit);
  if (hit) return hit;
  const list = await api(`/api/v3/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}&limit=20`);
  if (list.ok) {
    const body = (await list.json()) as { items?: { id: string; toolkit?: { slug?: string }; status?: string }[] };
    const found = body.items?.find((i) => i.toolkit?.slug === toolkit && i.status !== 'DISABLED');
    if (found) { authConfigCache.set(toolkit, found.id); return found.id; }
  }
  const made = await api('/api/v3/auth_configs', { method: 'POST', body: JSON.stringify({ toolkit: { slug: toolkit }, auth_config: { type: 'use_composio_managed_auth' } }) });
  if (!made.ok) throw new Error(`Could not set up ${toolkit} (${made.status})`);
  const id = ((await made.json()) as { auth_config?: { id?: string } }).auth_config?.id;
  if (!id) throw new Error(`Could not set up ${toolkit}`);
  authConfigCache.set(toolkit, id);
  return id;
}

/** Link that opens the provider's sign-in for this agent only. */
export async function createConnectLink(realtorId: string, appKey: string, origin: string): Promise<string> {
  const app = APPS[appKey];
  if (!app) throw new Error('Unknown integration');
  const res = await api('/api/v3.1/connected_accounts/link', {
    method: 'POST',
    body: JSON.stringify({ auth_config_id: await authConfigFor(app.toolkit), user_id: externalUserId(realtorId), callback_url: `${origin}/agents/closing-time?integration=connected` }),
  });
  if (!res.ok) throw new Error(`Could not start the connection (${res.status})`);
  return ((await res.json()) as { redirect_url: string }).redirect_url;
}

export async function listAccounts(realtorId: string): Promise<ConnectedAccount[]> {
  const res = await api(`/api/v3/connected_accounts?user_ids=${encodeURIComponent(externalUserId(realtorId))}&statuses=ACTIVE&limit=100`);
  if (!res.ok) throw new Error(`Could not load connections (${res.status})`);
  const body = (await res.json()) as { items?: { id: string; status?: string; toolkit?: { slug?: string } }[] };
  return (body.items ?? []).filter((a) => a.status === 'ACTIVE').map((a) => {
    const key = byToolkit(a.toolkit?.slug ?? '');
    return { id: a.id, appSlug: key, appName: APPS[key]?.name ?? '', healthy: true };
  }).filter((a) => a.appSlug);
}

export async function disconnectAccount(realtorId: string, accountId: string): Promise<void> {
  const owned = (await listAccounts(realtorId)).some((a) => a.id === accountId);
  if (!owned) throw new Error('Connection not found');
  const res = await api(`/api/v3/connected_accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`Could not disconnect (${res.status})`);
}

export async function accountFor(realtorId: string, keys: string[]): Promise<ConnectedAccount | null> {
  if (!composioConfigured()) return null;
  try {
    const all = await listAccounts(realtorId);
    for (const key of keys) {
      const hit = all.find((a) => a.appSlug === key);
      if (hit) return hit;
    }
  } catch { /* treated as not connected */ }
  return null;
}

/** Calls a provider API with this agent's own connected account. */
export async function proxyCall(_realtorId: string, accountId: string, url: string, init: { method?: string; json?: unknown; body?: Buffer; headers?: Record<string, string> } = {}): Promise<{ ok: boolean; status: number; data: unknown }> {
  const payload: Record<string, unknown> = { connected_account_id: accountId, endpoint: url, method: init.method ?? 'POST' };
  const contentType = init.headers?.['content-type'];
  const headers = Object.entries(init.headers ?? {}).filter(([k]) => k.toLowerCase() !== 'content-type');
  if (headers.length) payload.parameters = headers.map(([name, value]) => ({ name, value, type: 'header' }));
  if (init.json !== undefined) payload.body = init.json;
  if (init.body) payload.binary_body = { base64: init.body.toString('base64'), content_type: contentType ?? 'application/octet-stream' };
  const res = await api('/api/v3.1/tools/execute/proxy', { method: 'POST', body: JSON.stringify(payload) });
  const text = await res.text();
  let parsed: unknown = text;
  try { parsed = JSON.parse(text); } catch { /* keep text */ }
  if (!res.ok) return { ok: false, status: res.status, data: parsed };
  const wrapped = parsed as { status?: number; data?: unknown };
  const upstream = typeof wrapped.status === 'number' ? wrapped.status : 200;
  return { ok: upstream >= 200 && upstream < 300, status: upstream, data: wrapped.data ?? parsed };
}
