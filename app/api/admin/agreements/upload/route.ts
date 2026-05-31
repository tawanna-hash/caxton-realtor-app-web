// app/api/admin/agreements/upload/route.ts
//
// POST  multipart/form-data  { file: File }
// Uploads to Vercel Blob, creates a stub agreement row with is_uploaded=true.
// Sanitizes filename → company_name (mirrors Pressbook agHandleUpload).

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Mirror Pressbook agHandleUpload sanitisation. */
function sanitizeFilename(filename: string): string {
  // Strip extension
  const noExt = filename.replace(/\.[^.]+$/, '');
  // Replace dashes + underscores with spaces
  const spaced = noExt.replace(/[-_]+/g, ' ');
  // Strip common noise words
  const cleaned = spaced
    .replace(/\b(agreement|draft|signed|final|copy|ad|advertising|contract)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Title-case
  return cleaned
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

  try {
    // Upload to Vercel Blob
    const blob = await put(`agreements/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    const companyName = sanitizeFilename(file.name);
    const attachment = {
      name:       file.name,
      size:       file.size,
      url:        blob.url,
      uploadedAt: new Date().toISOString(),
    };

    await ensureSchema();
    const sql = getSql();

    const rows = await sql`
      INSERT INTO agreements (
        company_name, status, is_uploaded,
        attachments, created_by
      ) VALUES (
        ${companyName},
        'draft',
        true,
        ${JSON.stringify({ files: [attachment] })}::jsonb,
        ${admin.email ?? null}
      )
      RETURNING *
    `;

    return NextResponse.json({ agreement: rows[0] }, { status: 201 });
  } catch (err) {
    console.error('[admin/agreements/upload POST]', errMessage(err));
    return NextResponse.json({ error: 'upload failed', detail: errMessage(err) }, { status: 500 });
  }
}
