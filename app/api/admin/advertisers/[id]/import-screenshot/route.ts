// app/api/admin/advertisers/[id]/import-screenshot/route.ts
//
//   POST  — multipart/form-data with field `image` containing a PNG or JPEG.
//           Calls Gemini Vision to extract { locations, staff } from the
//           screenshot and bulk-inserts them into advertiser_locations +
//           advertiser_staff (+ advertiser_staff_locations join rows).
//
// Returns { inserted: { locations, staff }, extracted: { locations, staff } }
// so the client can show a summary toast and reload the editor.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { extractFromScreenshot } from '@/lib/server/gemini-screenshot-extract';
import { insertExtractedAdvertiserData } from '@/lib/server/advertiser-import-insert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Vision extraction can be slow on cold start; allow up to 60s.
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap on uploaded screenshot
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // Parse multipart form
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: 'invalid form', detail: errMessage(err) }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image file required (field "image")' }, { status: 400 });
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { error: `unsupported image type: ${mimeType || '(unknown)'}` },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `image too large: ${file.size} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buf.toString('base64');

  const result = await extractFromScreenshot({ imageBase64, mimeType });
  if (!result.ok) {
    const status = result.reason === 'no-key' ? 503 : result.reason === 'rate-limit' ? 429 : 502;
    return NextResponse.json(
      { error: `extraction failed: ${result.reason}`, detail: result.detail },
      { status },
    );
  }

  try {
    const counts = await insertExtractedAdvertiserData({
      advertiserId: idNum,
      extracted: result.data,
    });
    return NextResponse.json({
      ok: true,
      inserted: counts,
      extracted: result.data,
    });
  } catch (err) {
    console.error('[import-screenshot]', errMessage(err));
    return NextResponse.json(
      { error: 'insert failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
