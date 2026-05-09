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

  // Ads dashboard (Phase 1 — May 9, 2026)
  // Spaces: read-only catalog of 15 ad slots
  listAdSpaces: () => adminFetch('/admin/ads/spaces'),

  // Creatives: uploaded ad images stored on Vercel Blob
  listAdCreatives: () => adminFetch('/admin/ads/creatives'),
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
  }) => adminFetch('/admin/ads/campaigns', { method: 'POST', body: data }),
  updateAdCampaign: (id: string, data: Record<string, unknown>) =>
    adminFetch(`/admin/ads/campaigns/${id}`, { method: 'PATCH', body: data }),
  deleteAdCampaign: (id: string) =>
    adminFetch(`/admin/ads/campaigns/${id}`, { method: 'DELETE' }),
  toggleAdCampaign: (id: string) =>
    adminFetch(`/admin/ads/campaigns/${id}/toggle`, { method: 'POST' }),
};
