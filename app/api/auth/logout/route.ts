/**
 * /api/auth/logout  POST — clears the realtor session cookie.
 */

import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/server/error';
import { signOut } from '@/lib/server/auth/authjs';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  await signOut({ redirect: false });
  return NextResponse.json({ success: true });
});
