/**
 * Cookie-name constants only. No runtime imports.
 *
 * This file is safe to import from anywhere — Edge middleware, server
 * components, client code — because it pulls in zero dependencies. The
 * canonical server-side helpers (which read `next/headers`) live at
 * lib/server/auth/admin.ts and lib/server/auth/user.ts and re-export
 * these names so existing imports keep working.
 *
 * Renamed `_v2` during the Express → Next.js cutover. The legacy names
 * are still listed so the cookie-clearing path can expire them.
 */

export const ADMIN_SESSION_COOKIE_NAME = 'caxton_admin_session_v2';
export const LEGACY_ADMIN_SESSION_COOKIE_NAME = 'caxton_admin_session';

export const SESSION_COOKIE_NAME = 'caxton_session_v2';
export const LEGACY_SESSION_COOKIE_NAME = 'caxton_session';
