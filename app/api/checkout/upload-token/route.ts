// app/api/checkout/upload-token/route.ts
//
// Public Vercel Blob upload-token broker for self-serve advertiser checkout.
// Unlike /api/admin/ads/upload-token this does NOT require admin auth — anyone
// going through /advertise/checkout/[slot] must be able to upload their ad
// creative before paying. Anti-abuse:
//   - allowedContentTypes restricted to common ad image formats
//   - 10MB cap (matches admin uploader)
//   - clientPayload includes the slot slug so logs can correlate
//   - no DB row is written here; the /api/checkout/submit endpoint creates
//     the ad_creatives row only after a successful Stripe PaymentIntent.

import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
          maximumSizeInBytes: 10 * 1024 * 1024,
          tokenPayload: JSON.stringify({ pathname, clientPayload: clientPayload ?? '' }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[checkout-upload] blob completed', blob.url);
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
