/**
 * SABOR MLS Report admin API.
 *
 *   GET    /api/admin/sabor-mls       — list all reports (newest first)
 *   POST   /api/admin/sabor-mls       — create a new report
 *   PATCH  /api/admin/sabor-mls?id=N  — update an existing report
 *   DELETE /api/admin/sabor-mls?id=N  — soft delete (just removes row; PDF cleanup is a separate concern)
 *
 * All routes require an authenticated admin session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';

export const dynamic = 'force-dynamic';

interface MiniStat {
  value: string;
  label: string;
}

interface ReportInput {
  month_label: string;
  released_at: string;
  headline_value: string;
  headline_delta: string;
  headline_delta_direction: 'up' | 'down' | 'flat';
  headline_label: string;
  mini_stats: MiniStat[];
  page_count?: number | null;
  pdf_storage_key?: string | null;
}

function validate(body: Partial<ReportInput>): { ok: true; data: ReportInput } | { ok: false; error: string } {
  if (!body.month_label || typeof body.month_label !== 'string') return { ok: false, error: 'month_label required' };
  if (!body.released_at || typeof body.released_at !== 'string') return { ok: false, error: 'released_at required (YYYY-MM-DD)' };
  if (!body.headline_value) return { ok: false, error: 'headline_value required' };
  if (!body.headline_delta) return { ok: false, error: 'headline_delta required' };
  if (!body.headline_label) return { ok: false, error: 'headline_label required' };
  const dir = body.headline_delta_direction;
  if (dir !== 'up' && dir !== 'down' && dir !== 'flat') return { ok: false, error: 'headline_delta_direction must be up|down|flat' };
  if (!Array.isArray(body.mini_stats) || body.mini_stats.length !== 4) {
    return { ok: false, error: 'mini_stats must be an array of exactly 4 {value,label} objects' };
  }
  for (const m of body.mini_stats) {
    if (!m || typeof m.value !== 'string' || typeof m.label !== 'string') {
      return { ok: false, error: 'each mini_stat needs string value + label' };
    }
  }
  return {
    ok: true,
    data: {
      month_label: body.month_label,
      released_at: body.released_at,
      headline_value: body.headline_value,
      headline_delta: body.headline_delta,
      headline_delta_direction: dir,
      headline_label: body.headline_label,
      mini_stats: body.mini_stats as MiniStat[],
      page_count: body.page_count ?? null,
      pdf_storage_key: body.pdf_storage_key ?? null,
    },
  };
}

async function ensureSchema() {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS sabor_mls_reports (
      id                       SERIAL PRIMARY KEY,
      month_label              TEXT NOT NULL,
      released_at              DATE NOT NULL,
      headline_value           TEXT NOT NULL,
      headline_delta           TEXT NOT NULL,
      headline_delta_direction TEXT NOT NULL CHECK (headline_delta_direction IN ('up','down','flat')),
      headline_label           TEXT NOT NULL,
      mini_stats               JSONB NOT NULL,
      page_count               INTEGER,
      pdf_storage_key          TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, month_label, released_at::text AS released_at,
             headline_value, headline_delta, headline_delta_direction,
             headline_label, mini_stats, page_count, pdf_storage_key,
             created_at, updated_at
        FROM sabor_mls_reports
       ORDER BY released_at DESC
    `;
    return NextResponse.json({ ok: true, reports: rows });
  } catch (err) {
    console.error('[admin/sabor-mls GET]', err);
    return NextResponse.json({ ok: false, error: 'failed to list reports' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const body = await req.json();
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    const d = v.data;
    const sql = getSql();
    const rows = await sql`
      INSERT INTO sabor_mls_reports
        (month_label, released_at, headline_value, headline_delta,
         headline_delta_direction, headline_label, mini_stats, page_count, pdf_storage_key)
      VALUES
        (${d.month_label}, ${d.released_at}, ${d.headline_value}, ${d.headline_delta},
         ${d.headline_delta_direction}, ${d.headline_label}, ${JSON.stringify(d.mini_stats)}::jsonb,
         ${d.page_count}, ${d.pdf_storage_key})
      RETURNING id
    `;
    return NextResponse.json({ ok: true, id: (rows as { id: number }[])[0]?.id });
  } catch (err) {
    console.error('[admin/sabor-mls POST]', err);
    return NextResponse.json({ ok: false, error: 'failed to save report' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    const body = await req.json();
    const v = validate(body);
    if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
    const d = v.data;
    const sql = getSql();
    await sql`
      UPDATE sabor_mls_reports
         SET month_label              = ${d.month_label},
             released_at              = ${d.released_at},
             headline_value           = ${d.headline_value},
             headline_delta           = ${d.headline_delta},
             headline_delta_direction = ${d.headline_delta_direction},
             headline_label           = ${d.headline_label},
             mini_stats               = ${JSON.stringify(d.mini_stats)}::jsonb,
             page_count               = ${d.page_count},
             pdf_storage_key          = ${d.pdf_storage_key},
             updated_at               = NOW()
       WHERE id = ${id}
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/sabor-mls PATCH]', err);
    return NextResponse.json({ ok: false, error: 'failed to update report' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const id = Number(req.nextUrl.searchParams.get('id'));
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    const sql = getSql();
    await sql`DELETE FROM sabor_mls_reports WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[admin/sabor-mls DELETE]', err);
    return NextResponse.json({ ok: false, error: 'failed to delete report' }, { status: 500 });
  }
}
