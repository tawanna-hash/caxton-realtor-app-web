// Admin API client - thin fetch wrapper for /admin/* endpoints
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

type FetchOpts = {
  method?: string;
  body?: unknown;
};

async function adminFetch(path: string, opts: FetchOpts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    const err = new Error('Unauthorized') as Error & { status?: number };
    err.status = 401;
    throw err;
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error || j.message || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    const err = new Error(`API ${res.status}: ${detail}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export const adminApi = {
  // Auth
  login: (email: string, password: string) =>
    adminFetch('/admin/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => adminFetch('/admin/auth/logout', { method: 'POST' }),
  me: () => adminFetch('/admin/auth/me'),

  // Giveaways
  listGiveaways: () => adminFetch('/admin/giveaways'),
  getGiveaway: (id: string) => adminFetch(`/admin/giveaways/${id}`),
  createGiveaway: (data: Record<string, unknown>) =>
    adminFetch('/admin/giveaways', { method: 'POST', body: data }),
  updateGiveaway: (id: string, data: Record<string, unknown>) =>
    adminFetch(`/admin/giveaways/${id}`, { method: 'PATCH', body: data }),
  deleteGiveaway: (id: string) =>
    adminFetch(`/admin/giveaways/${id}`, { method: 'DELETE' }),

  // Rules
  createRule: (giveawayId: string, data: Record<string, unknown>) =>
    adminFetch(`/admin/giveaways/${giveawayId}/rules`, { method: 'POST', body: data }),
  updateRule: (giveawayId: string, ruleId: string, data: Record<string, unknown>) =>
    adminFetch(`/admin/giveaways/${giveawayId}/rules/${ruleId}`, { method: 'PATCH', body: data }),
  deleteRule: (giveawayId: string, ruleId: string) =>
    adminFetch(`/admin/giveaways/${giveawayId}/rules/${ruleId}`, { method: 'DELETE' }),

  // Entries & draw
  listEntries: (giveawayId: string, page = 1) =>
    adminFetch(`/admin/giveaways/${giveawayId}/entries?page=${page}`),
  drawWinner: (giveawayId: string) =>
    adminFetch(`/admin/giveaways/${giveawayId}/draw`, { method: 'POST' }),

  // Events (manual events admin — Phase 3 endpoints on droplet)
  listEvents: (publication?: 'austin' | 'san_antonio') => {
    const qs = publication ? `?publication=${publication}` : '';
    return adminFetch(`/admin/events${qs}`);
  },
  createEvent: (data: Record<string, unknown>) =>
    adminFetch('/admin/events', { method: 'POST', body: data }),
  updateEvent: (id: number, data: Record<string, unknown>) =>
    adminFetch(`/admin/events/${id}`, { method: 'PATCH', body: data }),
  deleteEvent: (id: number) =>
    adminFetch(`/admin/events/${id}`, { method: 'DELETE' }),
  hideEvent: (id: number) =>
    adminFetch(`/admin/events/${id}/hide`, { method: 'POST' }),
  unhideEvent: (id: number) =>
    adminFetch(`/admin/events/${id}/unhide`, { method: 'POST' }),
};
