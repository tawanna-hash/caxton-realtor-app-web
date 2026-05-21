// app/api/admin/magazines/upload-token/route.ts
//
// Admin-gated Vercel Blob upload-token issuer for magazine files.
//
// Pathname conventions:
//   magazine-staging/{stagingId}/{filename} — pre-create uploads (no DB row yet),
//                                              stagingId is a client-generated id like
//                                              "2026-05-20T15-23-45-abc123"
//   magazine-covers/{id}/{filename}         — edits to existing magazine cover
//   magazine-pdfs/{id}/{filename}           — full-issue PDF, up to 100MB
//   magazine-pages/{id}/{filename}          — individual page images

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_PDF_TYPES = ['application/pdf'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB — multipart upload from client
// Staging accepts either type since it covers cover + pdf + pages at create time.
const ALLOWED_STAGING_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_PDF_TYPES];

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
        if (pathname.startsWith('magazine-staging/')) {
          return {
            allowedContentTypes: ALLOWED_STAGING_TYPES,
            maximumSizeInBytes: MAX_PDF_BYTES, // permissive — staging may hold PDFs
            addRandomSuffix: true,
          };
        }
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
        console.log(
          `[admin/magazines/upload-token] blob ready: ${blob.url} (pathname=${blob.pathname})`,
        );
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[admin/magazines/upload-token] error:', msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
