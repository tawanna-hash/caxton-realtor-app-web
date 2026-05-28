/**
 * /api/auth/logout  POST — clears the realtor session cookie.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { clearRealtorSessionCookie } from '@/lib/server/auth/cookies';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const response = NextResponse.json({ success: true });
  await clearRealtorSessionCookie(response);
  return response;
});
