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

export type Pub = 'realtyline' | 'newsline';

export const PUB_COOKIE = 'caxton_pub';
export const PUB_LS_KEY = 'caxton_pub'; // legacy mirror
export const PUB_CHANGE_EVENT = 'savedPubChange';
export const PUB_DEFAULT: Pub = 'realtyline';

export function normalizePub(v: unknown): Pub | null {
  return v === 'realtyline' || v === 'newsline' ? v : null;
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
  return normalizePub(store.get(PUB_COOKIE)?.value) ?? PUB_DEFAULT;
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
