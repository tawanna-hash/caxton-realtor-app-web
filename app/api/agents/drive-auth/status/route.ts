/**
 * /api/agents/drive-auth/status
 *
 * GET — whether the signed-in realtor has a connected Google Drive, and
 *       which account, for the account settings panel.
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { getConnectedDrive, isDriveOAuthConfigured } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';

export const GET = withErrorHandling(async () => {
  const user = await requireUser();
  const connection = await getConnectedDrive(user.realtorId);
  return NextResponse.json({
    configured: isDriveOAuthConfigured(),
    connected: Boolean(connection),
    googleEmail: connection?.googleEmail ?? null,
    updatedAt: connection?.updatedAt ?? null,
  });
});
