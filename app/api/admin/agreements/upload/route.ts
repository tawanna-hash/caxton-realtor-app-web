// app/api/admin/agreements/upload/route.ts
//
// POST  multipart/form-data  { file: File, agreementId?: string }
//
// Two modes:
//   1. No agreementId  -> upload PDF and create a NEW stub agreement row
//                         (is_uploaded=true, status='draft'). Used for the
//                         "Upload signed agreement" entry point in
//                         /admin/billing.
//   2. With agreementId -> upload file and append it to the existing
//                          agreement's attachments.files JSONB array.
//                          Used by the agreement drawer's Attachments
//                          drop zone so files persist immediately without
//                          having to also click Save.
//
// Sanitizes filename → company_name (mirrors Pressbook agHandleUpload).

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AgreementRow = {
  id: string;
  attachments: { files?: Array<Record<string, unknown>> } | null;
  [key: string]: unknown;
};

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

  const agreementIdRaw = formData.get('agreementId');
  const agreementId = typeof agreementIdRaw === 'string' && agreementIdRaw.trim() ? agreementIdRaw.trim() : null;

  try {
    // Upload to Vercel Blob first — same for both modes.
    const blob = await put(`agreements/${Date.now()}-${file.name}`, file, {
      access: 'public',
    });

    const attachment = {
      name:       file.name,
      size:       file.size,
      url:        blob.url,
      uploadedAt: new Date().toISOString(),
    };

    await ensureSchema();
    const sql = getSql();

    if (agreementId) {
      // Mode 2: append to existing agreement's attachments.
      const found = (await sql`
        SELECT id, attachments FROM agreements WHERE id = ${agreementId}
      `) as unknown as AgreementRow[];
      if (found.length === 0) {
        return NextResponse.json({ error: 'agreement not found' }, { status: 404 });
      }
      const current = found[0];
      const existingFiles = Array.isArray(current.attachments?.files) ? current.attachments!.files! : [];
      const nextFiles = [...existingFiles, attachment];

      const updated = (await sql`
        UPDATE agreements
        SET attachments = ${JSON.stringify({ files: nextFiles })}::jsonb,
            updated_at = NOW()
        WHERE id = ${agreementId}
        RETURNING *
      `) as unknown as AgreementRow[];

      return NextResponse.json({ agreement: updated[0], attachment }, { status: 200 });
    }

    // Mode 1: create a new stub row. The file becomes the seed of a new
    // "uploaded paper agreement" the admin will then fill in.
    const companyName = sanitizeFilename(file.name);
    const rows = (await sql`
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
    `) as unknown as AgreementRow[];

    return NextResponse.json({ agreement: rows[0], attachment }, { status: 201 });
  } catch (err) {
    console.error('[admin/agreements/upload POST]', errMessage(err));
    return NextResponse.json({ error: 'upload failed', detail: errMessage(err) }, { status: 500 });
  }
}
