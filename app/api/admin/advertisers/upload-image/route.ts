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

export async function POST(req: NextRequest) {
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
  if (file.type && !file.type.startsWith('image/')) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type}` },
      { status: 400 },
    );
  }

  const kindRaw = formData.get('kind');
  const kind = typeof kindRaw === 'string' && VALID_KINDS.has(kindRaw) ? kindRaw : 'logo';

  try {
    const ext = safeExt(file);
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
}
