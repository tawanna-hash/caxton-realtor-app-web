// Admin: fill Dallas/Ft. Worth report fields from a board graphic or PDF.
//
//   JSON { board:'metrotex', areaKey, month }  -> finds MetroTex's published
//        graphic for that area/month and reads it: { ok, metrics, imageUrl, imageUrlEs }
//   multipart `file` (PNG/JPEG/WEBP)           -> reads an uploaded graphic: { ok, metrics }
//   multipart `file` (PDF, GFWAR report)       -> parses every area page: { ok, reports }

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type { DfwMetrics } from '@/lib/dfw-markets';
import { type ExtractedGraphic, extractGraphicBytes, findMetroTexGraphic, extractMetroTexGraphic, METROTEX_AREAS } from '@/lib/server/metrotex-report-import';
import { parseGfwarPdf } from '@/lib/server/gfwar-report-parser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function strip(m: ExtractedGraphic): DfwMetrics {
  const { reportMonth: _m, areaName: _a, ...rest } = m;
  void _m; void _a;
  return rest;
}

export async function POST(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const ctype = req.headers.get('content-type') ?? '';
  try {
    if (ctype.includes('application/json')) {
      const { areaKey, month } = (await req.json()) as { areaKey?: string; month?: string };
      const area = METROTEX_AREAS.find((a) => a.areaKey === areaKey);
      if (!area || !month || !/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ ok: false, error: 'areaKey and month required' }, { status: 400 });
      }
      const g = await findMetroTexGraphic(area, month);
      if (!g) return NextResponse.json({ ok: false, error: 'MetroTex has not published that graphic yet' }, { status: 404 });
      const m = await extractMetroTexGraphic(g.en);
      if (!m) return NextResponse.json({ ok: false, error: 'Could not read the graphic' }, { status: 502 });
      return NextResponse.json({ ok: true, metrics: strip(m), imageUrl: g.en, imageUrlEs: g.es });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file required' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'file too large' }, { status: 413 });
    const mime = (file.type || '').toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    if (mime === 'application/pdf') {
      const reports = await parseGfwarPdf(file.name || 'upload.pdf', new Uint8Array(buf));
      if (reports.length === 0) {
        return NextResponse.json({ ok: false, error: 'No report pages found in that PDF' }, { status: 422 });
      }
      return NextResponse.json({ ok: true, reports: reports.map((r) => ({ ...r, sourceUrl: null })) });
    }
    if (!IMAGE_MIME.has(mime)) return NextResponse.json({ ok: false, error: `unsupported file type ${mime}` }, { status: 415 });
    const m = await extractGraphicBytes(buf, mime);
    if (!m) return NextResponse.json({ ok: false, error: 'Could not read the graphic' }, { status: 502 });
    return NextResponse.json({ ok: true, metrics: strip(m), reportMonth: m.reportMonth ?? null, areaName: m.areaName ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
