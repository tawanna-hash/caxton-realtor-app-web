/**
 * POST /api/admin/auth/logout
 * Clear the admin session cookie. Always returns 200.
 */

import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/lib/server/auth/cookies';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const response = NextResponse.json({ success: true });
  await clearAdminSessionCookie(response);
  return response;
});
