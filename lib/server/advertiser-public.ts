// lib/server/advertiser-public.ts
//
// Advertiser rows carry portal credential columns (bcrypt hash, failed-login
// counter, lockout time). Those must never leave the server, so every admin
// API response that returns advertiser rows runs them through this helper.

const SERVER_ONLY_FIELDS = ['portal_password_hash', 'portal_failed_logins', 'portal_locked_until'] as const;

export function stripPortalSecrets<T extends object>(row: T): T {
  const copy = { ...row } as Record<string, unknown>;
  for (const key of SERVER_ONLY_FIELDS) delete copy[key];
  return copy as T;
}
