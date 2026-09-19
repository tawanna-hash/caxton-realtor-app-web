import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { NextResponse, type NextRequest } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

const recentUploads = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

function requesterKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitAllows(key: string): boolean {
  const now = Date.now();
  const hits = (recentUploads.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recentUploads.set(key, hits);
  return hits.length <= MAX_PER_WINDOW;
}

export const POST = withErrorHandling(async (req: NextRequest) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new ApiError(500, 'Flyer uploads are not configured');
  }
  if (!rateLimitAllows(requesterKey(req))) {
    throw new ApiError(429, 'Too many uploads. Please wait a minute and try again.');
  }

  const formData = await req.formData();
  const entry = formData.get('file');
  if (!(entry instanceof File)) {
    throw new ApiError(400, 'Choose a flyer image to upload');
  }

  const extension = ALLOWED_TYPES.get(entry.type);
  if (!extension) {
    throw new ApiError(400, 'Flyer must be a JPG, PNG, or WebP image');
  }
  if (entry.size <= 0 || entry.size > MAX_FILE_BYTES) {
    throw new ApiError(400, 'Flyer image must be 10 MB or smaller');
  }

  const blob = await put(
    `event-submissions/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${extension}`,
    entry,
    {
      access: 'public',
      contentType: entry.type,
      addRandomSuffix: false,
    },
  );

  return NextResponse.json({
    ok: true,
    url: blob.url,
    filename: entry.name,
    size: entry.size,
  });
});
