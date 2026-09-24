import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';
import { rateLimit } from '@/lib/server/rate-limit';
import { extractEventSchedulePage } from '@/lib/server/gemini-event-flyer-extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const POST = withAdminTracking(async function POST(request: NextRequest) {
  if (!(await getCurrentAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await rateLimit('general', 'event-schedule-extract');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid page upload.' }, { status: 400 });
  }
  const file = form.get('page');
  if (!(file instanceof File) || !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: 'Upload a JPG, PNG, or WebP schedule page.' }, { status: 415 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Schedule page must be 3 MB or smaller.' }, { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const validImage =
    (file.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (file.type === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.type === 'image/webp' && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
  if (!validImage) return NextResponse.json({ error: 'The uploaded page is not a valid image.' }, { status: 400 });

  const result = await extractEventSchedulePage({ imageBase64: bytes.toString('base64'), mimeType: file.type });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === 'rate-limit' ? 'Schedule reader is busy. Please retry shortly.' : 'Could not read this schedule page.', reason: result.reason },
      { status: result.reason === 'rate-limit' ? 429 : result.reason === 'no-key' ? 503 : 502 },
    );
  }
  return NextResponse.json({ schedule: result.schedule }, { headers: { 'Cache-Control': 'no-store' } });
});
