/**
 * /api/agents/drive-auth/disconnect
 *
 * POST — disconnect the signed-in realtor's Google Drive. Auto-uploads
 *        silently stop (treated as "not connected") until they reconnect.
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { disconnectDrive } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';

export const POST = withErrorHandling(async () => {
  const user = await requireUser();
  await disconnectDrive(user.realtorId);
  return NextResponse.json({ disconnected: true });
});
