import { randomUUID } from 'crypto';
import { del, put } from '@vercel/blob';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/server/db/neon';
import { requireUser } from '@/lib/server/auth/user';
import { withErrorHandling } from '@/lib/server/error';
import { rateLimit } from '@/lib/server/rate-limit';
import { ensureCustomFormsTable as ensureTable, extractPdfFields, type CustomFormRow } from '@/lib/server/custom-forms';

type Row = Pick<CustomFormRow, 'id' | 'section' | 'title' | 'filename' | 'url' | 'size_bytes' | 'created_at' | 'page_count' | 'field_catalog'>;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;
const SECTIONS = new Set(['trec', 'brokerage']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toForm = (r: Row) => ({ fillable: (r.field_catalog?.length ?? 0) > 0, id: r.id, section: r.section, title: r.title, filename: r.filename, url: r.url, size: r.size_bytes, createdAt: r.created_at });

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const user = await requireUser();
  await ensureTable();
  const fileId = req.nextUrl.searchParams.get('file');
  if (fileId) {
    if (!UUID_RE.test(fileId)) return NextResponse.json({ error: 'Invalid form.' }, { status: 400 });
    const found = await query<{ url: string }>(`SELECT url FROM closing_time_custom_forms WHERE id = $1 AND owner_id = $2`, [fileId, user.realtorId]);
    if (!found[0]) return NextResponse.json({ error: 'Form not found.' }, { status: 404 });
    const upstream = await fetch(found[0].url);
    if (!upstream.ok) return NextResponse.json({ error: 'Form file unavailable.' }, { status: 502 });
    return new Response(upstream.body, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  }
  const rows = await query<Row>(
    `SELECT id, section, title, filename, url, size_bytes, created_at, page_count, field_catalog FROM closing_time_custom_forms WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 500`,
    [user.realtorId],
  );
  return NextResponse.json({ forms: rows.map(toForm) });
});

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const user = await requireUser();
  await rateLimit('signWizard', user.realtorId);
  await ensureTable();
  const formData = await req.formData();
  const file = formData.get('file');
  const section = String(formData.get('section') ?? '');
  if (!SECTIONS.has(section)) return NextResponse.json({ error: 'Unknown forms section.' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a PDF to upload.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'PDF must be 15 MB or smaller.' }, { status: 413 });
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') return NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 });
  const id = randomUUID();
  const filename = file.name.slice(0, 200);
  const rawTitle = String(formData.get('title') ?? '').trim();
  const title = (rawTitle || filename.replace(/\.pdf$/i, '')).slice(0, 200);
  const blob = await put(`closing-time-forms/${user.realtorId}/${section}/${id}.pdf`, Buffer.from(bytes), {
    access: 'public', contentType: 'application/pdf', addRandomSuffix: false,
  });
  let parsed: Awaited<ReturnType<typeof extractPdfFields>>;
  try { parsed = await extractPdfFields(bytes, id.slice(0, 8)); } catch { parsed = { pageCount: 1, fields: [] }; }
  const rows = await query<Row>(
    `INSERT INTO closing_time_custom_forms (id, owner_id, section, title, filename, url, size_bytes, page_count, field_catalog)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id, section, title, filename, url, size_bytes, created_at, page_count, field_catalog`,
    [id, user.realtorId, section, title, filename, blob.url, bytes.length, parsed.pageCount, JSON.stringify(parsed.fields)],
  );
  return NextResponse.json({ form: toForm(rows[0]) });
});

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const user = await requireUser();
  await ensureTable();
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Invalid form.' }, { status: 400 });
  const rows = await query<{ url: string }>(
    `DELETE FROM closing_time_custom_forms WHERE id = $1 AND owner_id = $2 RETURNING url`,
    [id, user.realtorId],
  );
  if (rows[0]) await del(rows[0].url).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
