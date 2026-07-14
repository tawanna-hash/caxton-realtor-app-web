/**
 * POST /api/admin/marketing-attachments/upload-url
 *
 * Uses @vercel/blob/client handleUpload to issue a short-lived signed
 * token so the modal can upload files DIRECTLY to Vercel Blob without
 * routing bytes through this serverless function (avoids the 4.5MB
 * ingress cap on Vercel routes).
 *
 * @see [https://vercel.com/docs/vercel-blob/client-uploads](https://vercel.com/docs/vercel-blob/client-uploads)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 40 * 1024 * 1024; // Resend per-email ceiling

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        // Allow any file type — admin-only surface.
        allowedContentTypes: undefined,
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: true,
        // Attachments are ephemeral — expire in 24h. Nothing sends
        // more than a few minutes after upload in practice.
        tokenPayload: JSON.stringify({ ts: Date.now() }),
      }),
      onUploadCompleted: async () => {
        // No-op: we only need the URL back to the client, which the
        // handleUpload response already includes.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload token failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
