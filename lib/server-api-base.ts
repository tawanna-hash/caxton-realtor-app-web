/**
 * Server-side API base URL.
 *
 * After the api-merge, every endpoint lives in this same Next.js app under
 * /api, so we never need to make an HTTP call to ourselves. Server-side
 * callers should call the underlying lib/server/* helpers directly
 * (e.g. requireAdmin(), listEvents()) — fetching '/api/...' from a Route
 * Handler costs an extra round-trip for no reason.
 *
 * This function is kept only so legacy callers compile. New code: don't use
 * it. Old code using it will issue an absolute-URL fetch against
 * NEXT_PUBLIC_SITE_URL (e.g. https://realtynewsnow.app), which works but is
 * slower than calling the helper directly.
 */
import { headers } from 'next/headers';

export async function getServerApiBase(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return `${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api`;
  }
  const h = await headers();
  const host = h.get('host') ?? 'realtynewsnow.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}/api`;
}
