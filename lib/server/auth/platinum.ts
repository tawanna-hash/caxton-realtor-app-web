import { ApiError } from '@/lib/server/error';
import { requireUser } from '@/lib/server/auth/user';
import { getPlatinumAccess } from '@/lib/server/platinum-store';

// Temporarily disabled while Platinum Tools is introduced to subscribers.
// Restore the paywall by changing this flag to true.
export const PLATINUM_PAYWALL_ENABLED = false;

export async function requirePlatinumUser() {
  const user = await requireUser();
  const access = await getPlatinumAccess(user.realtorId);
  if (PLATINUM_PAYWALL_ENABLED && !access.active) {
    throw new ApiError(402, 'Platinum Tools membership required');
  }
  return { ...user, platinum: access };
}
