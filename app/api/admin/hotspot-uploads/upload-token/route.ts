// app/api/admin/hotspot-uploads/upload-token/route.ts
//
// Vercel Blob upload-token broker for hotspot media files (video, audio,
// image, reveal). Mirrors the pattern in app/api/admin/ads/upload-token/
// route.ts. Auth: forwards the admin session cookie to /admin/auth/me.
//
// Pathname convention (set by the editor client):
//   hotspot-video/<timestamp>-<safe-filename>
//   hotspot-audio/<timestamp>-<safe-filename>
//   hotspot-image/<timestamp>-<safe-filename>
//   hotspot-reveal/<timestamp>-<safe-filename>

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

const ALLOWED_TYPES = [
  // Image
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
  // Video — keep light, big files should be hosted on YouTube/Vimeo and embedded
  'video/mp4', 'video/webm', 'video/quicktime',
  // Audio
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm',
];
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
  if (!cookieHeader) return false;
  try {
    const r = await fetch(`${API_URL}/admin/auth/me`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    return r.ok;
  } catch { return false; }
}

export async function POST(request: Request): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie');
  if (!(await verifyAdmin(cookieHeader))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Hotspot media is recorded into the hotspot row via the editor's
        // own PATCH call to /api/admin/hotspots/[id]. Nothing to do here.
        console.log('[hotspot-upload] blob completed', blob.url);
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
