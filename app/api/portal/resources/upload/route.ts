// POST /api/portal/resources/upload — multipart upload for portal content.
// Returns { url, name, size, mime }. Auth: portal session.

import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import { ApiError, withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024; // stays under the serverless request body limit
const BLOCKED_EXT = new Set(['html', 'htm', 'js', 'mjs', 'exe', 'bat', 'sh', 'php', 'svgz']);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getCurrentPortalUser();
  if (!user) throw new ApiError(401, 'Unauthorized');

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new ApiError(400, 'Choose a file to upload.');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'Each file must be 4 MB or smaller. Add larger files as a shared link instead.');

  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (BLOCKED_EXT.has(ext)) throw new ApiError(400, 'That file type is not allowed.');
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(-120) || 'file';

  const blob = await put(`portal/${user.advertiser_id}/${randomUUID()}-${safe}`, file, {
    access: 'public',
    contentType: file.type || 'application/octet-stream',
    addRandomSuffix: false,
  });
  return NextResponse.json({ url: blob.url, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' });
});
