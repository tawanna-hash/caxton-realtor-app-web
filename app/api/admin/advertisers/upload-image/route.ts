// app/api/admin/advertisers/upload-image/route.ts
//
// POST multipart/form-data { file: File, kind: 'logo' | 'staff_photo' }
// Uploads an image to Vercel Blob and returns the public URL. Used by the
// admin CRM modal for the advertiser company logo (avatar_url) and by
// LocationsStaffEditor for staff headshots (photo_url).
//
// Accepts any image/* MIME type. 8 MB cap.

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function safeExt(file: File): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(file.name || '');
  if (m) return m[1].toLowerCase();
  const type = file.type || '';
  if (type.startsWith('image/')) return type.slice(6).toLowerCase().replace('+xml', '');
  return 'bin';
}

const VALID_KINDS = new Set(['logo', 'staff_photo']);

// Logos often arrive as vector source files from designers (.ai, .eps, .psd)
// or as PDFs from brand-kit handoffs. Staff photos stay image-only.
const LOGO_EXTRA_MIME = new Set([
  'application/pdf',
  'application/postscript', // .ai, .eps
  'application/illustrator', // some browsers report this for .ai
  'image/vnd.adobe.photoshop', // .psd (modern)
  'application/x-photoshop', // .psd (legacy)
  'application/photoshop', // .psd (legacy)
  'application/octet-stream', // fallback when the browser can't sniff a type
]);
const LOGO_EXTRA_EXTS = new Set(['pdf', 'ai', 'eps', 'psd']);

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'file is empty' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
      { status: 413 },
    );
  }
  const kindRaw = formData.get('kind');
  const kind: 'logo' | 'staff_photo' =
    typeof kindRaw === 'string' && VALID_KINDS.has(kindRaw)
      ? (kindRaw as 'logo' | 'staff_photo')
      : 'logo';

  const ext = safeExt(file);
  const type = file.type || '';
  const isImage = type.startsWith('image/');
  const isExtraLogoMime = LOGO_EXTRA_MIME.has(type);
  const isExtraLogoExt = LOGO_EXTRA_EXTS.has(ext);
  if (kind === 'logo') {
    if (!isImage && !isExtraLogoMime && !isExtraLogoExt) {
      return NextResponse.json(
        { error: `unsupported file type for logo: ${type || ext}` },
        { status: 400 },
      );
    }
  } else {
    // staff_photo stays image-only
    if (!isImage) {
      return NextResponse.json(
        { error: `unsupported file type: ${type || ext}` },
        { status: 400 },
      );
    }
  }

  try {
    const path = `advertisers/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const blob = await put(path, file, {
      access: 'public',
      contentType: file.type || undefined,
      addRandomSuffix: false,
    });
    return NextResponse.json({ url: blob.url, size: file.size, contentType: file.type });
  } catch (err) {
    console.error('[admin/advertisers/upload-image POST]', errMessage(err));
    return NextResponse.json(
      { error: 'upload failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
