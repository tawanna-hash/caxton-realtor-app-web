// Dallas/Ft. Worth is pre-launch. Its calendar (MetroTex import) is visible
// only to the signed-in accounts listed here until the market launches.
// Everyone else gets 403 from the Dallas events endpoints.

import { getCurrentUser } from '@/lib/server/auth/user';

const DALLAS_PREVIEW_EMAILS = new Set<string>(['tawanna@verock.com']);

export async function canViewDallasPreview(): Promise<boolean> {
  const user = await getCurrentUser();
  return !!user && DALLAS_PREVIEW_EMAILS.has(user.email.trim().toLowerCase());
}

export function dallasForbidden(): Response {
  return Response.json(
    { error: 'market_not_launched', message: 'This market is not available yet.' },
    { status: 403, headers: { 'Cache-Control': 'private, no-store' } },
  );
}
