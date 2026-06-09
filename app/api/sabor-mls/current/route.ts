/**
 * GET /api/sabor-mls/current
 *
 * Returns the most recently released SABOR MLS Summary Report row, shaped
 * for the Newsline feed <SaborReportCard>. Read-only, no auth required —
 * gating happens at /sso/start when the user clicks the CTA.
 *
 * Table is created on first hit (idempotent CREATE IF NOT EXISTS) so we
 * don't need a separate migration step. Schema is intentionally tiny and
 * additive; the headline + 4 mini stats are stored as denormalized JSON
 * so the editor can shape the card per month without code changes.
 */

import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface MiniStat {
  value: string;
  label: string;
}

interface ReportRow {
  id: number;
  month_label: string;
  released_at: string;
  headline_value: string;
  headline_delta: string;
  headline_delta_direction: 'up' | 'down' | 'flat';
  headline_label: string;
  mini_stats: MiniStat[];
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
      headline_label           TEXT NOT NULL,
      mini_stats               JSONB NOT NULL,
      page_count               INTEGER,
      pdf_storage_key          TEXT,
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS sabor_mls_reports_released_at_idx ON sabor_mls_reports (released_at DESC)`;
  schemaEnsured = true;
}

export async function GET() {
  try {
    await ensureSchema();
    const sql = getSql();
    const rows = (await sql`
      SELECT id, month_label, released_at::text AS released_at,
             headline_value, headline_delta, headline_delta_direction,
             headline_label, mini_stats, page_count, pdf_storage_key
        FROM sabor_mls_reports
       ORDER BY released_at DESC
       LIMIT 1
    `) as ReportRow[];

    if (!rows || rows.length === 0) {
      // Empty table — let the card use its hard-coded April 2026 fallback.
      return NextResponse.json({ ok: true, report: null }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const r = rows[0];
    return NextResponse.json({
      ok: true,
      report: {
        month_label: r.month_label,
        released_at: r.released_at,
        headline_value: r.headline_value,
        headline_delta: r.headline_delta,
        headline_delta_direction: r.headline_delta_direction,
        headline_label: r.headline_label,
        mini_stats: r.mini_stats,
        page_count: r.page_count,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[sabor-mls/current]', err);
    // Card has its own fallback; don't 500 the feed.
    return NextResponse.json({ ok: true, report: null }, { status: 200 });
  }
}
