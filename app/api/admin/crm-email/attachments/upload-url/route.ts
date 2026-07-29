// app/api/admin/crm-email/attachments/upload-url/route.ts
//
// Vercel Blob client-upload token issuer. Client uploads directly to
// Blob (bypassing the 4.5 MB Vercel route body limit).

import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif',
          'application/zip',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // no-op: composer tracks urls client-side
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({
      error: 'upload token failed',
      detail: err instanceof Error ? err.message : 'error',
    }, { status: 500 });
  }
});
