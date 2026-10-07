import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { publicSubmitLimited } from '@/lib/server/rate-limit';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const limited = await publicSubmitLimited('eblast-upload');
  if (limited) return limited as never;
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
      onBeforeGenerateToken: async (pathname, clientPayload) => ({
        allowedContentTypes: [
          'image/png',
          'image/jpeg',
          'image/webp',
          'image/gif',
          'application/pdf',
          'text/html',
          'application/zip',
        ],
        maximumSizeInBytes: 10 * 1024 * 1024,
        tokenPayload: JSON.stringify({
          pathname,
          clientPayload: clientPayload ?? '',
        }),
      }),
      onUploadCompleted: async ({ blob }) => {
        console.log('[checkout-eblast-upload] blob completed', blob.url);
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
