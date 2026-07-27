/**
 * POST /api/admin/auth/logout
 * Clear the admin session cookie. Always returns 200.
 */

import { NextResponse } from 'next/server';
import { clearAdminSessionCookie } from '@/lib/server/auth/cookies';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async () => {
  const response = NextResponse.json({ success: true });
  await clearAdminSessionCookie(response);
  return response;
});
