// caxton-ads-v1
// Vercel API route that brokers Vercel Blob client-direct uploads
// for the admin ads dashboard. Uses Vercel's official handleUpload
// helper. Auth: verifies the request originates from a logged-in
// admin by proxying the session cookie to the droplet's
// /admin/me endpoint. If that returns 200, we mint the upload
// token; otherwise reject.
//
// Flow:
//   1. Browser POSTs { type: 'blob.generate-client-token', payload: {...} }
//   2. We forward the cookie to droplet GET /admin/me
//   3. If admin verified, hand back a signed token
//   4. Browser uploads directly to Vercel Blob with that token
//   5. Browser then POSTs the resulting blob_url to droplet
//      POST /admin/ads/creatives to record metadata.
//
// The droplet does NOT see the file bytes — the upload bypasses it.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.myrealtyline.com';

export const runtime = 'nodejs';

async function verifyAdmin(cookieHeader: string | null): Promise<boolean> {
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

export async function POST(request: Request): Promise<NextResponse> {
  const cookieHeader = request.headers.get('cookie');
  const isAdmin = await verifyAdmin(cookieHeader);
  if (!isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname /* , clientPayload */) => {
        // Restrict accepted types and size. Adjust as needed.
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024, // 10MB per ad creative
          tokenPayload: JSON.stringify({ pathname }),
        };
      },
      onUploadCompleted: async ({ blob /* , tokenPayload */ }) => {
        // No-op: the admin UI will explicitly POST the blob URL to
        // the droplet to record the AdCreative row. We don't auto-record
        // here because we want the advertiser_name + click_url + alt_text
        // captured at the same moment, which only the form has.
        // Logging server-side for debug visibility:
        console.log('[ads-upload] blob completed', blob.url);
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
