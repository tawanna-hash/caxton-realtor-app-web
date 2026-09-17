/**
 * /api/agent-command-center/documents/download
 *
 * GET ?fileId=<driveFileId>&fileName=<name> — stream one previously
 *     uploaded checklist-document file back from the signed-in realtor's
 *     connected Google Drive. Used client-side when assembling the
 *     "download folder" zip for a closed deal — each attached document is
 *     fetched here, one request per file, and folded into the archive.
 *
 * We only ever fetch files by id, and only within the realtor's own
 * `drive.file`-scoped grant, so this can't be used to read arbitrary
 * files outside what this app itself uploaded.
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { downloadFileFromDrive } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: Request) => {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get('fileId');
  if (!fileId) throw new ApiError(400, 'Missing fileId.');

  const result = await downloadFileFromDrive(user.realtorId, fileId);
  if (!result) throw new ApiError(404, 'This file could not be found in Google Drive.');

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
});
