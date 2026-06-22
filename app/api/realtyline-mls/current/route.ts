/**
 * GET /api/realtyline-mls/current
 *
 * Returns the most recently released RealtyLine (ABoR / Austin) MLS Summary
 * Report row, shaped for the RealtyLine feed <RealtyLineReportCard>.
 * Read-only, no auth required.
 *
 * The table is created on first hit (idempotent CREATE IF NOT EXISTS) so we
 * don't need a separate migration step.
 */

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import {
  makeBlankReport,
  type RealtyLineReport,
  type DeltaDirection,
  type IndicatorStat,
  type ListingCount,
  type PriceBand,
} from '@/lib/realtyline-mls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  headline_label_en: string | null;
  headline_label_es: string | null;
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
    CREATE TABLE IF NOT EXISTS realtyline_mls_reports (
      id                       SERIAL PRIMARY KEY,
      month_label              TEXT NOT NULL,
      month_label_es           TEXT,
      released_at              DATE NOT NULL,
      subtitle_en              TEXT,
      subtitle_es              TEXT,
      headline_value           TEXT NOT NULL,
      headline_delta           TEXT NOT NULL,
      headline_delta_direction TEXT NOT NULL CHECK (headline_delta_direction IN ('up','down','flat')),
      headline_label_en        TEXT,
      headline_label_es        TEXT,
      indicator_stats          JSONB,
      listing_counts           JSONB,
      price_bands              JSONB,
      page_count               INTEGER,
      pdf_storage_key          TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS realtyline_mls_reports_released_at_idx ON realtyline_mls_reports (released_at DESC)`;
  schemaEnsured = true;
}

function rowToReport(r: ReportRow): RealtyLineReport {
  const base = makeBlankReport(r.month_label, r.released_at);
  return {
    month_label: r.month_label,
    month_label_es: r.month_label_es || base.month_label_es,
    released_at: r.released_at,
    subtitle_en: r.subtitle_en || base.subtitle_en,
    subtitle_es: r.subtitle_es || base.subtitle_es,
    headline_value: r.headline_value,
    headline_delta: r.headline_delta,
    headline_delta_direction: r.headline_delta_direction,
    headline_label_en: r.headline_label_en || base.headline_label_en,
    headline_label_es: r.headline_label_es || base.headline_label_es,
    indicator_stats:
      Array.isArray(r.indicator_stats) && r.indicator_stats.length > 0
        ? r.indicator_stats
        : base.indicator_stats,
    listing_counts: Array.isArray(r.listing_counts) ? r.listing_counts : [],
    price_bands: Array.isArray(r.price_bands) ? r.price_bands : [],
    page_count: r.page_count,
    pdf_storage_key: r.pdf_storage_key,
  };
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, month_label, month_label_es, released_at::text AS released_at,
             subtitle_en, subtitle_es,
             headline_value, headline_delta, headline_delta_direction,
             headline_label_en, headline_label_es,
             indicator_stats, listing_counts, price_bands,
             page_count, pdf_storage_key
        FROM realtyline_mls_reports
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
    console.error('[realtyline-mls/current]', err);
    return NextResponse.json({ ok: true, report: null }, { status: 200 });
  }
}
