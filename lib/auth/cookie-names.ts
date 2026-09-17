/**
 * Cookie-name constants only. No runtime imports.
 *
 * This file is safe to import from anywhere — Edge middleware, server
 * components, client code — because it pulls in zero dependencies. The
 * canonical server-side helpers (which read `next/headers`) live at
 * lib/server/auth/admin.ts and lib/server/auth/user.ts and re-export
 * these names so existing imports keep working.
 *
 * Renamed `_v2` during the Express → Next.js cutover. Legacy names were
 * retired in the Wave 3 cleanup — any leftover Express-era cookies have
 * long since expired client-side.
 */

export const ADMIN_SESSION_COOKIE_NAME = 'caxton_admin_session_v2';

export const SESSION_COOKIE_NAME = 'caxton_session_v2';
