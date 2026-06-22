/**
 * SABOR MLS Report admin API (v2 — full SABOR infographic shape + Spanish).
 *
 *   GET    /api/admin/sabor-mls       — list all reports (newest first)
 *   POST   /api/admin/sabor-mls       — create a new report
 *   PATCH  /api/admin/sabor-mls?id=N  — update an existing report
 *   DELETE /api/admin/sabor-mls?id=N  — remove row (PDF cleanup is separate)
 *
 * All routes require an authenticated admin session.
 *
 * Schema is additive: legacy mini_stats column stays for backward compat
 * with the April 2026 row; new indicator_stats / listing_counts / price_bands
 * JSONB columns + *_es text columns are added with ALTER TABLE IF NOT EXISTS.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import type {
  SaborReport,
  IndicatorStat,
  ListingCount,
  PriceBand,
  DeltaDirection,
} from '@/lib/sabor-mls';

export const dynamic = 'force-dynamic';

function isDir(v: unknown): v is DeltaDirection {
  return v === 'up' || v === 'down' || v === 'flat';
}

function validateIndicator(m: unknown): m is IndicatorStat {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  if (typeof r.key !== 'string') return false;
  if (typeof r.label_en !== 'string') return false;
  if (typeof r.label_es !== 'string') return false;
  if (typeof r.value !== 'string') return false;
  if (r.delta !== undefined && typeof r.delta !== 'string') return false;
  if (r.delta_direction !== undefined && !isDir(r.delta_direction)) return false;
  return true;
}

function validateListingCount(m: unknown): m is ListingCount {
  return validateIndicator(m);
}

function validatePriceBand(m: unknown): m is PriceBand {
  if (!m || typeof m !== 'object') return false;
  const r = m as Record<string, unknown>;
  if (typeof r.key !== 'string') return false;
  if (typeof r.label_en !== 'string') return false;
  if (typeof r.label_es !== 'string') return false;
  if (typeof r.share !== 'string') return false;
  return true;
}

function validate(body: Partial<SaborReport>): { ok: true; data: SaborReport } | { ok: false; error: string } {
  if (!body.month_label || typeof body.month_label !== 'string') return { ok: false, error: 'month_label required' };
  if (typeof body.month_label_es !== 'string') return { ok: false, error: 'month_label_es required' };
  if (!body.released_at || typeof body.released_at !== 'string') return { ok: false, error: 'released_at required (YYYY-MM-DD)' };
  if (typeof body.subtitle_en !== 'string') return { ok: false, error: 'subtitle_en required' };
  if (typeof body.subtitle_es !== 'string') return { ok: false, error: 'subtitle_es required' };
  if (typeof body.headline_value !== 'string') return { ok: false, error: 'headline_value required' };
  if (typeof body.headline_delta !== 'string') return { ok: false, error: 'headline_delta required' };
  if (!isDir(body.headline_delta_direction)) return { ok: false, error: 'headline_delta_direction must be up|down|flat' };
  if (typeof body.headline_label_en !== 'string') return { ok: false, error: 'headline_label_en required' };
  if (typeof body.headline_label_es !== 'string') return { ok: false, error: 'headline_label_es required' };

  if (!Array.isArray(body.indicator_stats) || body.indicator_stats.length === 0) {
    return { ok: false, error: 'indicator_stats must be a non-empty array' };
  }
  for (const m of body.indicator_stats) {
    if (!validateIndicator(m)) return { ok: false, error: 'each indicator_stat needs key/label_en/label_es/value' };
  }
  if (!Array.isArray(body.listing_counts) || body.listing_counts.length === 0) {
    return { ok: false, error: 'listing_counts must be a non-empty array' };
  }
  for (const m of body.listing_counts) {
    if (!validateListingCount(m)) return { ok: false, error: 'each listing_count needs key/label_en/label_es/value' };
  }
  if (!Array.isArray(body.price_bands) || body.price_bands.length === 0) {
    return { ok: false, error: 'price_bands must be a non-empty array' };
  }
  for (const m of body.price_bands) {
    if (!validatePriceBand(m)) return { ok: false, error: 'each price_band needs key/label_en/label_es/share' };
  }

  return {
    ok: true,
    data: {
      month_label: body.month_label,
      month_label_es: body.month_label_es,
      released_at: body.released_at,
      subtitle_en: body.subtitle_en,
      subtitle_es: body.subtitle_es,
      headline_value: body.headline_value,
      headline_delta: body.headline_delta,
      headline_delta_direction: body.headline_delta_direction,
      headline_label_en: body.headline_label_en,
      headline_label_es: body.headline_label_es,
      indicator_stats: body.indicator_stats as IndicatorStat[],
      listing_counts: body.listing_counts as ListingCount[],
      price_bands: body.price_bands as PriceBand[],
      page_count: body.page_count ?? null,
      pdf_storage_key: body.pdf_storage_key ?? null,
    },
  };
}

async function ensureSchema() {
  const sql = getSql();
  // Legacy base table (idempotent).
  await sql`
    CREATE TABLE IF NOT EXISTS sabor_mls_reports (
      id                       SERIAL PRIMARY KEY,
      month_label              TEXT NOT NULL,
      released_at              DATE NOT NULL,
      headline_value           TEXT NOT NULL,
      headline_delta           TEXT NOT NULL,
      headline_delta_direction TEXT NOT NULL CHECK (headline_delta_direction IN ('up','down','flat')),
      headline_label           TEXT NOT NULL,
      mini_stats               JSONB,
      page_count               INTEGER,
      pdf_storage_key          TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  // Make legacy columns nullable so v2 writes don't have to populate them.
  await sql`ALTER TABLE sabor_mls_reports ALTER COLUMN mini_stats DROP NOT NULL`;
  await sql`ALTER TABLE sabor_mls_reports ALTER COLUMN headline_label DROP NOT NULL`;
  // v2 additive columns.
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS month_label_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS subtitle_en TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS subtitle_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS headline_label_en TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS headline_label_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS indicator_stats JSONB`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS listing_counts JSONB`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS price_bands JSONB`;
}

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT id, month_label, month_label_es, released_at::text AS released_at,
             subtitle_en, subtitle_es,
             headline_value, headline_delta, headline_delta_direction,
             headline_label, headline_label_en, headline_label_es,
             mini_stats, indicator_stats, listing_counts, price_bands,
             page_count, pdf_storage_key, created_at, updated_at
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
    // headline_label kept in sync with headline_label_en so any old code that
    // SELECTs the legacy column keeps working.
    const rows = await sql`
      INSERT INTO sabor_mls_reports
        (month_label, month_label_es, released_at,
         subtitle_en, subtitle_es,
         headline_value, headline_delta, headline_delta_direction,
         headline_label, headline_label_en, headline_label_es,
         indicator_stats, listing_counts, price_bands,
         page_count, pdf_storage_key)
      VALUES
        (${d.month_label}, ${d.month_label_es}, ${d.released_at},
         ${d.subtitle_en}, ${d.subtitle_es},
         ${d.headline_value}, ${d.headline_delta}, ${d.headline_delta_direction},
         ${d.headline_label_en}, ${d.headline_label_en}, ${d.headline_label_es},
         ${JSON.stringify(d.indicator_stats)}::jsonb,
         ${JSON.stringify(d.listing_counts)}::jsonb,
         ${JSON.stringify(d.price_bands)}::jsonb,
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
             month_label_es           = ${d.month_label_es},
             released_at              = ${d.released_at},
             subtitle_en              = ${d.subtitle_en},
             subtitle_es              = ${d.subtitle_es},
             headline_value           = ${d.headline_value},
             headline_delta           = ${d.headline_delta},
             headline_delta_direction = ${d.headline_delta_direction},
             headline_label           = ${d.headline_label_en},
             headline_label_en        = ${d.headline_label_en},
             headline_label_es        = ${d.headline_label_es},
             indicator_stats          = ${JSON.stringify(d.indicator_stats)}::jsonb,
             listing_counts           = ${JSON.stringify(d.listing_counts)}::jsonb,
             price_bands              = ${JSON.stringify(d.price_bands)}::jsonb,
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
