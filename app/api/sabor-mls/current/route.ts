/**
 * GET /api/sabor-mls/current
 *
 * Returns the most recently released SABOR MLS Summary Report row, shaped
 * for the Newsline San Antonio feed <SaborReportCard>. Read-only, no auth required.
 *
 * The table is created on first hit (idempotent CREATE IF NOT EXISTS) so we
 * don't need a separate migration step. v2 adds JSONB columns for
 * indicator_stats / listing_counts / price_bands plus *_es text columns;
 * legacy rows (mini_stats only) are coerced into the new shape via
 * legacyToReport() so old data keeps rendering.
 */

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import {
  legacyToReport,
  type SaborReport,
  type DeltaDirection,
  type IndicatorStat,
  type ListingCount,
  type PriceBand,
} from '@/lib/sabor-mls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface LegacyMiniStatRow { value: string; label: string }

interface ReportRow {
  id: number;
  month_label: string;
  month_label_es: string | null;
  released_at: string;
  subtitle_en: string | null;
  subtitle_es: string | null;
  headline_value: string;
  headline_delta: string;
  headline_delta_direction: DeltaDirection;
  headline_label: string | null;
  headline_label_en: string | null;
  headline_label_es: string | null;
  mini_stats: LegacyMiniStatRow[] | null;
  indicator_stats: IndicatorStat[] | null;
  listing_counts: ListingCount[] | null;
  price_bands: PriceBand[] | null;
  page_count: number | null;
  pdf_storage_key: string | null;
}

let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured) return;
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS sabor_mls_reports (
      id                       SERIAL PRIMARY KEY,
      month_label              TEXT NOT NULL,
      released_at              DATE NOT NULL,
      headline_value           TEXT NOT NULL,
      headline_delta           TEXT NOT NULL,
      headline_delta_direction TEXT NOT NULL CHECK (headline_delta_direction IN ('up','down','flat')),
      headline_label           TEXT,
      mini_stats               JSONB,
      page_count               INTEGER,
      pdf_storage_key          TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS month_label_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS subtitle_en TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS subtitle_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS headline_label_en TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS headline_label_es TEXT`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS indicator_stats JSONB`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS listing_counts JSONB`;
  await sql`ALTER TABLE sabor_mls_reports ADD COLUMN IF NOT EXISTS price_bands JSONB`;
  await sql`CREATE INDEX IF NOT EXISTS sabor_mls_reports_released_at_idx ON sabor_mls_reports (released_at DESC)`;
  schemaEnsured = true;
}

function rowToReport(r: ReportRow): SaborReport {
  // New-shape row: indicator_stats present + non-empty.
  if (
    Array.isArray(r.indicator_stats) &&
    r.indicator_stats.length > 0 &&
    Array.isArray(r.listing_counts) &&
    Array.isArray(r.price_bands)
  ) {
    return {
      month_label: r.month_label,
      month_label_es: r.month_label_es || r.month_label,
      released_at: r.released_at,
      subtitle_en: r.subtitle_en || '',
      subtitle_es: r.subtitle_es || '',
      headline_value: r.headline_value,
      headline_delta: r.headline_delta,
      headline_delta_direction: r.headline_delta_direction,
      headline_label_en: r.headline_label_en || r.headline_label || '',
      headline_label_es: r.headline_label_es || r.headline_label_en || r.headline_label || '',
      indicator_stats: r.indicator_stats,
      listing_counts: r.listing_counts,
      price_bands: r.price_bands,
      page_count: r.page_count,
      pdf_storage_key: r.pdf_storage_key,
    };
  }
  // Legacy row — coerce via shim.
  return legacyToReport({
    month_label: r.month_label,
    released_at: r.released_at,
    headline_value: r.headline_value,
    headline_delta: r.headline_delta,
    headline_delta_direction: r.headline_delta_direction,
    headline_label: r.headline_label || '',
    mini_stats: r.mini_stats || [],
    page_count: r.page_count,
  });
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, month_label, month_label_es, released_at::text AS released_at,
             subtitle_en, subtitle_es,
             headline_value, headline_delta, headline_delta_direction,
             headline_label, headline_label_en, headline_label_es,
             mini_stats, indicator_stats, listing_counts, price_bands,
             page_count, pdf_storage_key
        FROM sabor_mls_reports
       ORDER BY released_at DESC
       LIMIT 1
    `) as ReportRow[];

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: true, report: null }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json(
      { ok: true, report: rowToReport(rows[0]) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[sabor-mls/current]', err);
    return NextResponse.json({ ok: true, report: null }, { status: 200 });
  }
}
