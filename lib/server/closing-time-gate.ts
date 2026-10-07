import { getCurrentAdmin } from './auth/admin';
import { getCurrentUser } from './auth/user';

/**
 * Closing Time is still in development. In production it is open only to the
 * owner: the front-end (realtor) account or the admin account below. Everyone
 * else (signed in or not) sees the Coming Soon message. Local dev and Vercel
 * preview deployments are unaffected.
 *
 * Applies to every entry point that renders Closing Time workspace data or
 * behavior, not just the dedicated /agents/closing-time route — including the
 * embedded `panelsOnly` view on /agents. Keep every such entry point calling
 * this same helper so the restriction can't be bypassed via a different page.
 */
export const CLOSING_TIME_OWNER_FRONT_END_EMAIL = 'tawanna@verock.com';
export const CLOSING_TIME_OWNER_ADMIN_EMAIL = 'tawanna@myrealtyline.com';

const same = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b;

export async function isClosingTimeGated(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return false;
  const [user, admin] = await Promise.all([getCurrentUser(), getCurrentAdmin()]);
  if (same(user?.email, CLOSING_TIME_OWNER_FRONT_END_EMAIL)) return false;
  if (same(admin?.email, CLOSING_TIME_OWNER_ADMIN_EMAIL)) return false;
  return true;
}
