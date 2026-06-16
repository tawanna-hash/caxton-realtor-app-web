// app/api/sign/[token]/upload/route.ts
//
// Public (no admin auth) signature upload — the HMAC token IS the auth.
//
// POST multipart/form-data { file: File }
// Used by the sign wizard to upload either:
//   - a drawn signature (canvas → PNG)
//   - a pre-signed document (PDF or image) the advertiser uploads
//
// Returns { url } pointing to the stored blob. The caller is expected to
// then POST the sign endpoint with `signedDocumentUrl` to persist the link
// on the agreement.

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { verifyToken } from '@/lib/sign-token';
import { getSql, ensureSchema } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 10 MB hard cap. PDFs and signature PNGs are well under this.
const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'application/pdf',
]);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const parsed = verifyToken(token);
  if (!parsed) {
    return NextResponse.json({ error: 'invalid or expired token' }, { status: 401 });
  }
  const { agreementId: id } = parsed;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  const kind = String(formData.get('kind') ?? 'document'); // 'signature' | 'document'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: 'empty file' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 10 MB)' }, { status: 413 });
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `unsupported file type: ${file.type}. Use PDF, PNG, JPEG, or WEBP.` },
      { status: 415 },
    );
  }

  try {
    // Confirm the agreement still exists and is not already signed/active.
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, status FROM agreements WHERE id = ${id}
    `) as unknown as { id: string; status: string }[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (rows[0].status === 'signed' || rows[0].status === 'active') {
      return NextResponse.json({ error: 'agreement already signed' }, { status: 409 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
    const path = `agreements/sign/${id}/${kind}-${Date.now()}-${safeName}`;

    const blob = await put(path, file, { access: 'public' });

    return NextResponse.json({ url: blob.url, kind, size: file.size }, { status: 201 });
  } catch (err) {
    console.error('[api/sign upload POST]', errMessage(err));
    return NextResponse.json(
      { error: 'upload failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
}
