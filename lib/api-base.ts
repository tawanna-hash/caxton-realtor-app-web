/**
 * Host-aware API base URL.
 *
 * When the frontend is served from realtynewsnow.app, route API calls to
 * api.realtynewsnow.app (same registrable domain) so cookies remain
 * same-site. For all other hosts (app.myrealtyline.com, localhost, Vercel
 * previews) fall back to NEXT_PUBLIC_API_URL — which in production is
 * https://api.myrealtyline.com.
 */
export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'realtynewsnow.app' || host.endsWith('.realtynewsnow.app')) {
      return 'https://api.realtynewsnow.app';
    }
    if (host === 'localhost' || host === '127.0.0.1') {
      return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';
}
