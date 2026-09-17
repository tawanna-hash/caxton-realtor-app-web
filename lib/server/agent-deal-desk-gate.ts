import { getCurrentAdmin } from './auth/admin';

/**
 * Agent Deal Desk is still in development. In production, only a signed-in
 * admin can reach live Deal Desk functionality — everyone else sees a Coming
 * Soon message. Local dev and Vercel preview deployments are unaffected.
 *
 * Applies to every entry point that renders Deal Desk workspace data or
 * behavior, not just the dedicated /agents/deal-desk route — including the
 * embedded `panelsOnly` view on /agents. Keep every such entry point calling
 * this same helper so the restriction can't be bypassed via a different page.
 */
export async function isDealDeskGated(): Promise<boolean> {
  if (process.env.VERCEL_ENV !== 'production') return false;
  const admin = await getCurrentAdmin();
  return !admin;
}
