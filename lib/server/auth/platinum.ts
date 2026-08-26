import { ApiError } from '@/lib/server/error';
import { requireUser } from '@/lib/server/auth/user';
import { getPlatinumAccess } from '@/lib/server/platinum-store';

export async function requirePlatinumUser() {
  const user = await requireUser();
  const access = await getPlatinumAccess(user.realtorId);
  if (!access.active) {
    throw new ApiError(402, 'Platinum Tools membership required');
  }
  return { ...user, platinum: access };
}
