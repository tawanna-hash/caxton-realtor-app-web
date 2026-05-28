import { getApiBase } from '@/lib/api-base';
// Admin API client - thin fetch wrapper for /admin/* endpoints
const API_BASE = getApiBase();

type FetchOpts = {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
};

async function adminFetch(path: string, opts: FetchOpts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
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
  // Bulk soft-hide all events whose start date is in the past.
  // Returns { hiddenCount: number }.
  hideExpiredEvents: () =>
    adminFetch('/admin/events/hide-expired', { method: 'POST' }),

  // Ads dashboard (Phase 1 — May 9, 2026)
  // Spaces: read-only catalog of 15 ad slots
  listAdSpaces: () => adminFetch('/admin/ads/spaces'),

  // Creatives: uploaded ad images stored on Vercel Blob
  listAdCreatives: () => adminFetch('/admin/ads/creatives'),

  // Subscribers (realtors)
  getSubscriber: (id: string) => adminFetch('/admin/subscribers/' + encodeURIComponent(id)),

  updateSubscriber: (id: string, patch: Record<string, unknown>) =>
    adminFetch(`/admin/subscribers/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),

  deactivateSubscriber: (id: string) =>
    adminFetch(`/admin/subscribers/${encodeURIComponent(id)}/deactivate`, { method: 'POST' }),

  sendMagicLinkToSubscriber: (id: string) =>
    adminFetch(`/admin/subscribers/${encodeURIComponent(id)}/send-magic-link`, { method: 'POST' }),

  deleteSubscriber: (id: string) =>
    adminFetch(`/admin/subscribers/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listSubscribers: (params: { page?: number; pageSize?: number; market?: 'austin' | 'san_antonio'; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.market) qs.set('market', params.market);
    if (params.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return adminFetch(`/admin/subscribers${suffix}`);
  },

  exportSubscribersCsv: async () => {
    const API_BASE_LOCAL = getApiBase();
    const res = await fetch(`${API_BASE_LOCAL}/admin/subscribers/export.csv`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const match = cd.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `caxton_subscribers_${new Date().toISOString().slice(0, 10)}.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
  // Note: actual file upload happens client-direct to Vercel Blob via
  // /api/admin/ads/upload-token. This method only RECORDS the resulting
  // blob_url + metadata into ad_creatives.
  recordAdCreative: (data: {
    advertiser_name: string;
    blob_url: string;
    width: number | null;
    height: number | null;
    click_url: string;
    alt_text: string | null;
  }) => adminFetch('/admin/ads/creatives', { method: 'POST', body: data }),
  deleteAdCreative: (id: string) =>
    adminFetch(`/admin/ads/creatives/${id}`, { method: 'DELETE' }),

  // Campaigns: scheduled placements (advertiser × slot × pub × dates)
  listAdCampaigns: () => adminFetch('/admin/ads/campaigns'),
  createAdCampaign: (data: {
    advertiser_name: string;
    ad_space_slug: string;
    creative_id: string;
    publication: 'austin' | 'san_antonio' | 'both';
    start_date: string;
    end_date: string;
    price_total: number | null;
    price_notes: string | null;
    notes: string | null;
  }, signal?: AbortSignal) => adminFetch('/admin/ads/campaigns', { method: 'POST', body: data, signal }),
  updateAdCampaign: (id: string, data: Record<string, unknown>, signal?: AbortSignal) =>
    adminFetch(`/admin/ads/campaigns/${id}`, { method: 'PATCH', body: data, signal }),
  deleteAdCampaign: (id: string) =>
    adminFetch(`/admin/ads/campaigns/${id}`, { method: 'DELETE' }),
  toggleAdCampaign: (id: string) =>
    adminFetch(`/admin/ads/campaigns/${id}/toggle`, { method: 'POST' }),
};
