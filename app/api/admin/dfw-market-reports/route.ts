// Admin: Dallas/Ft. Worth board market reports.
//   GET  ?board=metrotex|gfwar      -> { ok, reports: DfwAdminRow[] }
//   PUT  { report: DfwMarketReport } -> saves one area/month (marks it edited
//        so the daily import won't overwrite the admin's values)
//   PUT  { reports: DfwMarketReport[] } -> bulk save (e.g. a parsed PDF)

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { listDfwReportsForAdmin, upsertDfwReports } from '@/lib/server/dfw-market-reports-store';
import type { DfwBoard, DfwMarketReport } from '@/lib/dfw-markets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOARDS = new Set<DfwBoard>(['metrotex', 'gfwar']);
const TYPES = new Set(['region', 'county', 'zip']);

function valid(r: unknown): r is DfwMarketReport {
  if (!r || typeof r !== 'object') return false;
  const x = r as Record<string, unknown>;
  return (
    BOARDS.has(x.board as DfwBoard) &&
    TYPES.has(String(x.areaType)) &&
    typeof x.areaKey === 'string' && /^[a-z0-9-]{2,60}$/.test(x.areaKey) &&
    typeof x.areaLabel === 'string' && x.areaLabel.length > 0 && x.areaLabel.length < 80 &&
    typeof x.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(x.month) &&
    !!x.metrics && typeof x.metrics === 'object'
  );
}

function clean(r: DfwMarketReport): DfwMarketReport {
  const metrics: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(r.metrics ?? {})) {
    if (!/^[a-zA-Z]{2,40}$/.test(k)) continue;
    const s = v == null ? '' : String(v).trim().slice(0, 60);
    metrics[k] = s === '' ? null : s;
  }
  return {
    board: r.board, areaType: r.areaType, areaKey: r.areaKey, areaLabel: r.areaLabel.trim(), month: r.month,
    metrics, sourceUrl: r.sourceUrl ?? null, imageUrl: r.imageUrl ?? null, imageUrlEs: r.imageUrlEs ?? null,
  };
}

export async function GET(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  const board = req.nextUrl.searchParams.get('board') as DfwBoard;
  if (!BOARDS.has(board)) return NextResponse.json({ ok: false, error: 'board required' }, { status: 400 });
  return NextResponse.json({ ok: true, reports: await listDfwReportsForAdmin(board) });
}

export async function PUT(req: NextRequest) {
  if (!(await getCurrentAdmin())) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  let body: { report?: unknown; reports?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const list = Array.isArray(body.reports) ? body.reports : body.report ? [body.report] : [];
  if (list.length === 0 || list.length > 500 || !list.every(valid)) {
    return NextResponse.json({ ok: false, error: 'invalid report' }, { status: 400 });
  }
  const saved = await upsertDfwReports((list as DfwMarketReport[]).map(clean), { fromAdmin: true });
  return NextResponse.json({ ok: true, saved });
}
