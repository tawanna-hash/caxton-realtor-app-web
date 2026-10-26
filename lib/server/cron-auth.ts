/**
 * Shared cron authentication. Fails closed: a request is accepted only when it
 * carries `Authorization: Bearer ${CRON_SECRET}`. The only bypass is a local
 * `next dev` session (NODE_ENV === 'development' and not running on Vercel).
 * Do not gate on VERCEL_ENV: if that variable is missing or unexpected at
 * runtime, a gate keyed on it silently opens every cron endpoint.
 */
import { timingSafeEqual } from 'node:crypto';

/** True everywhere except a local `next dev` session. */
export function cronAuthEnforced(): boolean {
  return !(process.env.NODE_ENV === 'development' && !process.env.VERCEL);
}

/** Constant-time check of the Authorization header against CRON_SECRET. */
export function hasValidCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}
