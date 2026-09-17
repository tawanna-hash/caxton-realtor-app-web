/**
 * /api/agents/drive-auth/upload
 *
 * POST — receive one exported file from the agent's browser (multipart
 *        form: `file`, `filename`) and push it into the signed-in realtor's
 *        connected Google Drive folder. Silent/best-effort by design: the
 *        local download already happened client-side, so a Drive failure
 *        here (not connected, expired grant, transient API error) must
 *        never surface as an error to the export button — callers should
 *        treat this as fire-and-forget.
 */

import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling, ApiError } from '@/lib/server/error';
import { uploadFileToDrive } from '@/lib/server/google-drive-client';

export const runtime = 'nodejs';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const POST = withErrorHandling(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData();
  const file = form.get('file');
  const filenameField = form.get('filename');
  if (!(file instanceof Blob) || typeof filenameField !== 'string' || !filenameField.trim()) {
    throw new ApiError(400, 'Missing file or filename.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'File is too large to back up to Drive.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || 'application/octet-stream';
  const result = await uploadFileToDrive(user.realtorId, filenameField.trim(), mimeType, buffer);

  return NextResponse.json(result);
});
