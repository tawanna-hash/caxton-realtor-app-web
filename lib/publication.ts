/**
 * Publication state — single source of truth.
 *
 * Pre-existing model: each component had its own readPub() that consulted
 * localStorage.caxton_pub with a default of 'realtyline'. This caused:
 *   - Server always rendered as RealtyLine (no localStorage on server).
 *   - Incognito always rendered as RealtyLine (localStorage empty).
 *   - AdSlot read pub once at mount and never reacted to switches.
 *   - 10+ ad-hoc readPub() copies that could drift.
 *
 * New model:
 *   - Cookie `caxton_pub` is the authoritative state.
 *   - Cookie is readable from server (RSC, route handlers, middleware) AND
 *     client (document.cookie), so both layers agree on first paint.
 *   - `?pub=realtyline|newsline` query param overrides + persists the cookie
 *     via middleware, so links are durable permalinks.
 *   - All client components subscribe to a single store via `usePublication`.
 *   - localStorage is kept as a mirror for legacy code paths until those are
 *     migrated away. Cookie wins on conflict.
 */

// PubKey is re-exported as the canonical Pub type so the two sources of
// truth stay aligned. Houston/Dallas are valid Pub values as of Phase 2
// PR A even though they ship with empty-shell content.
import type { PubKey } from './pub-meta';
import { isPubKey, isPreLaunchPub } from './pub-meta';
export type Pub = PubKey;

export const PUB_COOKIE = 'caxton_pub';
export const PUB_LS_KEY = 'caxton_pub'; // legacy mirror
export const PUB_CHANGE_EVENT = 'savedPubChange';
export const PUB_DEFAULT: Pub = 'realtyline';

/**
 * Normalize an arbitrary value into a Pub.
 *
 * @param v - The raw value (cookie, query param, localStorage, etc).
 * @param opts.allowPreLaunch - When true, pre-launch markets like
 *   'realtyline-houston' / 'realtyline-dallas' are accepted. Defaults to
 *   false so the picker, cookie reads, and admin tools don't accidentally
 *   route users to a market with empty-shell content. Phase 2 PR C will
 *   flip pre-launch markets to fully-launched in PUB_META and remove this
 *   guard for them.
 */
export function normalizePub(
  v: unknown,
  opts: { allowPreLaunch?: boolean } = {},
): Pub | null {
  if (!isPubKey(v)) return null;
  if (!opts.allowPreLaunch && isPreLaunchPub(v)) return null;
  return v;
}

/**
 * Server-side: read the publication from the request cookies. Use in RSC
 * pages, route handlers, and metadata generators.
 *
 *   import { cookies } from 'next/headers';
 *   import { getServerPub } from '@/lib/publication';
 *   const pub = await getServerPub();
 */
export async function getServerPub(): Promise<Pub> {
  // Lazy-require to keep this module usable from client bundles. Server
  // callers will be the only ones that hit this branch.
  const { cookies } = await import('next/headers');
  const store = await cookies();
  // Admin sessions are allowed to preview pre-launch pubs (Houston/Dallas)
  // via the ?pub= deep-link middleware in proxy.ts. Detect either the
  // current v2 session cookie or the legacy one so QA on either path works.
  const hasAdmin = !!(
    store.get('caxton_admin_session_v2')?.value ||
    store.get('caxton_admin_session')?.value
  );
  return (
    normalizePub(store.get(PUB_COOKIE)?.value, { allowPreLaunch: hasAdmin }) ??
    PUB_DEFAULT
  );
}

/**
 * Client-side raw read from document.cookie. Used by the client store as
 * the initial snapshot AND on each subscribe-tick. Falls back to
 * localStorage for backwards compatibility.
 */
export function readClientPub(): Pub {
  if (typeof document === 'undefined') return PUB_DEFAULT;
  const m = document.cookie.match(/(?:^|;\s*)caxton_pub=([^;]+)/);
  const fromCookie = normalizePub(m?.[1] ? decodeURIComponent(m[1]) : null);
  if (fromCookie) return fromCookie;
  try {
    return normalizePub(window.localStorage.getItem(PUB_LS_KEY)) ?? PUB_DEFAULT;
  } catch {
    return PUB_DEFAULT;
  }
}

/**
 * Client-side write. Sets cookie (1 year), mirrors to localStorage, and
 * dispatches the cross-tab change event.
 */
export function writeClientPub(pub: Pub): void {
  if (typeof document === 'undefined') return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${PUB_COOKIE}=${pub}; path=/; max-age=${maxAge}; SameSite=Lax`;
  try {
    window.localStorage.setItem(PUB_LS_KEY, pub);
  } catch {}
  try {
    window.dispatchEvent(new Event(PUB_CHANGE_EVENT));
  } catch {}
}
