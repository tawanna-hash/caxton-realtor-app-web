/**
 * /api/agent-command-center/documents/upload
 *
 * POST — receive one checklist-document file from the agent's browser
 *        (multipart form: `file`, `dealId`, `documentId`) and store it in
 *        the signed-in realtor's connected Google Drive, inside a
 *        per-deal subfolder of the app's Drive folder. We never persist
 *        the file bytes ourselves (no Vercel Blob usage here) — only the
 *        returned Drive file id + filename get saved onto the deal's
 *        document record via the normal workspace save.
 *
 * Requires the realtor to already have Google Drive connected; returns
 * 409 with `reason: 'not_connected'` otherwise so the client can prompt
 * them to connect it instead of silently failing.
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { uploadFileToDrive } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DEAL_ID_RE = /^[\w-]{1,120}$/;

export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData();
  const file = form.get('file');
  const dealId = form.get('dealId');
  const documentId = form.get('documentId');

  if (!(file instanceof Blob)) throw new ApiError(400, 'Missing file.');
  if (typeof dealId !== 'string' || !DEAL_ID_RE.test(dealId)) throw new ApiError(400, 'Missing or invalid dealId.');
  if (typeof documentId !== 'string' || !DEAL_ID_RE.test(documentId)) throw new ApiError(400, 'Missing or invalid documentId.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, 'File is too large (25MB max).');

  const originalName = file instanceof File && file.name ? file.name : `${documentId}-upload`;
  const safeName = originalName.replace(/[^\w.\-]+/g, '_');
  const filename = `${documentId}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';

  const result = await uploadFileToDrive(user.realtorId, filename, mimeType, buffer, dealId);
  if (!result.uploaded || !result.fileId) {
    if (result.reason === 'not_connected') {
      return NextResponse.json({ error: 'Google Drive is not connected.', reason: 'not_connected' }, { status: 409 });
    }
    throw new ApiError(502, 'Could not upload this file to Google Drive. Try again in a moment.');
  }

  return NextResponse.json({
    driveFileId: result.fileId,
    fileName: originalName,
    fileUploadedAt: new Date().toISOString(),
  });
});
