// app/api/admin/advertisers/[id]/import-data/route.ts
//
//   POST  — multipart/form-data with field `file` containing a CSV,
//           Excel (.xlsx / .xls), or XML file. Parses it into
//           { locations, staff } and reuses the same insert path as
//           /import-screenshot so the downstream behaviour (mailing
//           sync, primary-location guard, etc.) is identical.
//
// Returns { inserted: { locations, staff }, extracted: { locations, staff } }.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { insertExtractedAdvertiserData } from '@/lib/server/advertiser-import-insert';
import { detectTabularKind, parseTabularUpload } from '@/lib/server/tabular-import';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 16 * 1024 * 1024; // 16 MB cap (Excel can be larger than images)

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withAdminTracking(async function POST(req: NextRequest, ctx: RouteCtx) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum < 1) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: 'invalid form', detail: errMessage(err) }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required (field "file")' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `file too large: ${file.size} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const kind = detectTabularKind(file.type || '', file.name || '');
  if (!kind) {
    return NextResponse.json(
      {
        error: 'unsupported file type',
        detail: `expected CSV, XLSX, XLS, or XML — got mime="${file.type}" name="${file.name}"`,
      },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  const parsed = await parseTabularUpload({ buf, kind });
  if (!parsed.ok) {
    return NextResponse.json(
      { error: `parse failed: ${parsed.reason}`, detail: parsed.detail },
      { status: 422 },
    );
  }

  // Guard against truly empty payloads.
  if (parsed.data.locations.length === 0 && parsed.data.staff.length === 0) {
    return NextResponse.json(
      { error: 'no data found', detail: 'parser returned 0 locations and 0 staff' },
      { status: 422 },
    );
  }

  try {
    const counts = await insertExtractedAdvertiserData({
      advertiserId: idNum,
      extracted: parsed.data,
    });
    return NextResponse.json({
      ok: true,
      kind,
      inserted: counts,
      extracted: parsed.data,
    });
  } catch (err) {
    console.error('[import-data]', errMessage(err));
    return NextResponse.json(
      { error: 'insert failed', detail: errMessage(err) },
      { status: 500 },
    );
  }
});
