/**
 * API base URL.
 *
 * Previously routed to api.realtynewsnow.app (or api.myrealtyline.com) — a
 * separate DigitalOcean droplet. After the api-merge (May 2026), every
 * /admin/* and /auth/* endpoint lives in the same Next.js app under /api,
 * so we just return '/api' as a relative prefix.
 *
 * All callers do `fetch(`${API_BASE}/admin/auth/login`)` which becomes
 * `/api/admin/auth/login` — same-origin, no CORS, no cookie-domain games.
 *
 * The function is kept (rather than inlining '/api') so we can re-introduce
 * a host-aware switch later without touching every caller.
 */
export function getApiBase(): string {
  return '/api';
}
