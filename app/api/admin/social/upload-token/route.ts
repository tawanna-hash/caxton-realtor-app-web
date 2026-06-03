// caxton-social-v1
// Vercel Blob client-direct upload broker for /admin/social images.
// Used when the admin pastes a group-post URL (Groups API is dead) and
// needs to upload the post image manually. Pattern mirrors
// /app/api/admin/ads/upload-token/route.ts.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';

async function verifyAdmin(): Promise<boolean> {
  try {
    const admin = await getCurrentAdmin();
    return admin !== null;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: [
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/gif',
          ],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[social-upload] blob completed', blob.url);
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
