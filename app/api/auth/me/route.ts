/**
 * /api/auth/me  GET — return the current realtor or 401.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { requireUser } from '@/lib/server/auth/user';
import { getRealtorMe, bumpLastAppOpen } from '@/lib/server/realtors-store';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const realtor = await getRealtorMe(user.realtorId);
  if (!realtor) throw new ApiError(404, 'Account not found');

  // Best-effort, fire-and-forget. Don't block the response on this.
  bumpLastAppOpen(realtor.id).catch((err) => {
    logger.warn({ err }, 'Failed to update last_app_open_at');
  });

  const { password_set_at: passwordSetAt, ...rest } = realtor;
  return NextResponse.json({
    realtor: {
      ...rest,
      hasPassword: passwordSetAt !== null,
      passwordSetAt,
    },
  });
});
