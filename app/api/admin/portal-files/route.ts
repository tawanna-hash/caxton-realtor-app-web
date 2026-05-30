// app/api/admin/portal-files/route.ts
//
// POST — staff uploads metadata for a file to share with an advertiser.
// GET  — list files (optionally filtered by advertiser_id).

import { NextRequest, NextResponse } from 'next/server';
import { getSql, ensureSchema } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const advertiserId = req.nextUrl.searchParams.get('advertiser_id');
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = advertiserId
      ? await sql`SELECT * FROM portal_files WHERE advertiser_id = ${Number(advertiserId)} ORDER BY created_at DESC`
      : await sql`SELECT * FROM portal_files ORDER BY created_at DESC LIMIT 100`;
    return NextResponse.json({ files: rows });
  } catch (err) {
    return NextResponse.json({ error: 'list failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const advertiserId = Number(body.advertiser_id);
  if (!advertiserId || Number.isNaN(advertiserId)) {
    return NextResponse.json({ error: 'advertiser_id required' }, { status: 400 });
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const fileUrl = typeof body.file_url === 'string' ? body.file_url.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (!fileUrl) return NextResponse.json({ error: 'file_url required' }, { status: 400 });

  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      INSERT INTO portal_files (
        advertiser_id, agreement_id, invoice_id, title, description,
        file_url, file_name, file_mime, file_size_bytes,
        category, visibility, uploaded_by
      ) VALUES (
        ${advertiserId},
        ${(body.agreement_id as string | undefined) ?? null},
        ${(body.invoice_id as string | undefined) ?? null},
        ${title},
        ${(body.description as string | undefined) ?? null},
        ${fileUrl},
        ${(body.file_name as string | undefined) ?? null},
        ${(body.file_mime as string | undefined) ?? null},
        ${typeof body.file_size_bytes === 'number' ? body.file_size_bytes : null},
        ${(body.category as string | undefined) ?? 'document'},
        ${body.visibility === 'hidden' ? 'hidden' : 'visible'},
        ${admin.email ?? null}
      ) RETURNING *
    `;
    return NextResponse.json({ file: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'create failed', detail: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
