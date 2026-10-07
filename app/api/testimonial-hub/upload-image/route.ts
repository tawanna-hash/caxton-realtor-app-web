import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await requireUser();
  const formData = await req.formData();
  const file = formData.get('file');
  const kind = formData.get('kind') === 'headshot' ? 'headshot' : 'client';

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Choose an image to upload.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be 5 MB or smaller.' }, { status: 413 });
  }

  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: 'Use a JPG, PNG, or WebP image.' },
      { status: 400 },
    );
  }

  const blob = await put(
    `testimonials/${session.realtorId}/${kind}/${randomUUID()}.${extension}`,
    file,
    {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    },
  );

  return NextResponse.json({
    url: blob.url,
    size: file.size,
    contentType: file.type,
  });
});
