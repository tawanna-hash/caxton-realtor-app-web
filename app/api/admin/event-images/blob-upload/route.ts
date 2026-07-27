// Authorizes client-side direct-to-Blob uploads for event images.
// The browser calls upload() from @vercel/blob which hits this route
// to get a presigned upload URL, then uploads the file directly to
// Vercel Blob storage — bypassing the serverless function payload limit.

import { handleUpload } from '@vercel/blob';
import { requireAdmin } from '@/lib/server/auth/admin';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (request: Request) => {
  await requireAdmin();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json(
      { error: 'Vercel Blob is not configured.' },
      { status: 500 },
    );
  }

  const json = await request.json();
  const blobResult = await handleUpload({
    request,
    pathname: json.pathname as string,
  });

  return blobResult;
});
