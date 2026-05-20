// app/api/admin/magazines/upload-token/route.ts
//
// Issues a Vercel Blob upload token for admin magazine file uploads.
// Mirrors app/api/admin/inventory/upload-token/route.ts (same handleUpload
// pattern, same admin-auth gate, same two-step upload flow):
//   1. Client POSTs here to get a signed token
//   2. Client PUTs file bytes directly to Vercel Blob's edge endpoint
//   3. File never passes through this serverless function (avoids the 4.5MB
//      body limit and egress cost)
//
// Pathname conventions (admins can only write under these prefixes):
//   magazine-covers/{id}/{filename}  — cover image (jpg/png/webp), up to 10MB
//   magazine-pdfs/{id}/{filename}    — full-issue PDF, up to 100MB
//   magazine-pages/{id}/{filename}   — individual page images, up to 10MB each
//
// After upload, the client receives the public blob URL and PATCHes the
// magazine row via /api/admin/magazines/[id] to attach the URL(s). This
// route never touches the DB.
//
// Orphan blobs (uploads that never get attached, or replaced URLs) are
// not garbage collected here. Filed as a future cleanup task — same
// pattern as inventory orphan blobs.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;

async function isAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const ok = await isAdmin(cookieHeader);
  if (!ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (pathname.startsWith('magazine-covers/')) {
          return {
            allowedContentTypes: ALLOWED_IMAGE_TYPES,
            maximumSizeInBytes: MAX_IMAGE_BYTES,
            addRandomSuffix: true,
          };
        }
        if (pathname.startsWith('magazine-pdfs/')) {
          return {
            allowedContentTypes: ALLOWED_PDF_TYPES,
            maximumSizeInBytes: MAX_PDF_BYTES,
            addRandomSuffix: true,
          };
        }
        if (pathname.startsWith('magazine-pages/')) {
          return {
            allowedContentTypes: ALLOWED_IMAGE_TYPES,
            maximumSizeInBytes: MAX_IMAGE_BYTES,
            addRandomSuffix: true,
          };
        }
        throw new Error(`Invalid upload path prefix: ${pathname}`);
      },
      onUploadCompleted: async ({ blob }) => {
        // Client receives the blob URL from the upload() call and
        // PATCHes the magazine row separately.
        console.log(
          `[admin/magazines/upload-token] blob ready: ${blob.url} (pathname=${blob.pathname})`,
        );
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/magazines/upload-token] error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
