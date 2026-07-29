/**
 * POST /api/admin/realtyline-mls/import-graphic
 *
 * Multipart/form-data field `image`: PNG/JPEG/WEBP/GIF or PDF of the
 * ABoR / UnlockMLS monthly stats infographic.
 *
 * Returns { ok: true, extracted: ExtractedRealtylineReport } — client
 * merges into the editor's form state; every field is optional.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { extractFromRealtylineGraphic } from '@/lib/server/gemini-realtyline-extract';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'invalid form', detail: errMessage(err) }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'image file required (field "image")' }, { status: 400 });
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ ok: false, error: `unsupported file type: ${mimeType || '(unknown)'}` }, { status: 415 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: `file too large: ${file.size} bytes (max ${MAX_BYTES})` }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buf.toString('base64');

  const result = await extractFromRealtylineGraphic({ imageBase64, mimeType });
  if (!result.ok) {
    captureServerEvent('realtyline_import_failed', admin.email ?? 'server', {
      surface: 'admin_realtyline_mls',
      reason: result.reason,
      mime_type: mimeType,
      byte_size: file.size,
    });
    await flushServerEvents();
    const status =
      result.reason === 'no-key' ? 503 :
      result.reason === 'rate-limit' ? 429 :
      result.reason === 'timeout' ? 504 : 502;
    return NextResponse.json({ ok: false, error: `extraction failed: ${result.reason}`, detail: result.detail }, { status });
  }

  const d = result.data;
  captureServerEvent('realtyline_import_succeeded', admin.email ?? 'server', {
    surface: 'admin_realtyline_mls',
    mime_type: mimeType,
    byte_size: file.size,
    month_label: d.month_label ?? null,
    indicator_count: d.indicator_stats?.length ?? 0,
    listing_count: d.listing_counts?.length ?? 0,
    band_count: d.price_bands?.length ?? 0,
  });
  await flushServerEvents();

  return NextResponse.json({ ok: true, extracted: d });
});
