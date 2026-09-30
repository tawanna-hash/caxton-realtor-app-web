// Postgres store for Dallas/Ft. Worth board market reports (one row per
// board + area + month). Imported by /api/cron/sync-dfw-market-reports.

import { getSql } from '@/lib/db';
import type { DfwBoard, DfwMarketReport } from '@/lib/dfw-markets';

let schemaReady: Promise<void> | null = null;

export function ensureDfwReportsSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql();
      await sql`
        CREATE TABLE IF NOT EXISTS dfw_market_reports (
          id           SERIAL PRIMARY KEY,
          board        TEXT NOT NULL,
          area_type    TEXT NOT NULL,
          area_key     TEXT NOT NULL,
          area_label   TEXT NOT NULL,
          month        TEXT NOT NULL,
          metrics      JSONB NOT NULL DEFAULT '{}'::jsonb,
          source_url   TEXT,
          image_url    TEXT,
          image_url_es TEXT,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (board, area_type, area_key, month)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS dfw_market_reports_board_month ON dfw_market_reports (board, month DESC)`;
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

export async function upsertDfwReports(rows: DfwMarketReport[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureDfwReportsSchema();
  const sql = getSql();
  let n = 0;
  for (const r of rows) {
    await sql`
      INSERT INTO dfw_market_reports (board, area_type, area_key, area_label, month, metrics, source_url, image_url, image_url_es)
      VALUES (${r.board}, ${r.areaType}, ${r.areaKey}, ${r.areaLabel}, ${r.month}, ${JSON.stringify(r.metrics)}::jsonb,
              ${r.sourceUrl}, ${r.imageUrl ?? null}, ${r.imageUrlEs ?? null})
      ON CONFLICT (board, area_type, area_key, month) DO UPDATE SET
        area_label   = EXCLUDED.area_label,
        metrics      = EXCLUDED.metrics,
        source_url   = EXCLUDED.source_url,
        image_url    = COALESCE(EXCLUDED.image_url, dfw_market_reports.image_url),
        image_url_es = COALESCE(EXCLUDED.image_url_es, dfw_market_reports.image_url_es),
        updated_at   = NOW()
    `;
    n++;
  }
  return n;
}

/** Existing (board, areaKey, month) keys, used to skip re-extracting graphics. */
export async function existingKeys(board: DfwBoard, months: string[]): Promise<Set<string>> {
  await ensureDfwReportsSchema();
  const rows = (await getSql()`
    SELECT area_key, month FROM dfw_market_reports WHERE board = ${board} AND month = ANY(${months}::text[])
  `) as Array<{ area_key: string; month: string }>;
  return new Set(rows.map((r) => `${r.area_key}|${r.month}`));
}

interface Row {
  board: DfwBoard; area_type: DfwMarketReport['areaType']; area_key: string; area_label: string; month: string;
  metrics: DfwMarketReport['metrics']; source_url: string | null; image_url: string | null; image_url_es: string | null;
  updated_at: string;
}

/** Latest month per board, all areas for that month. */
export async function listLatestDfwReports(): Promise<{ months: Record<DfwBoard, string | null>; reports: DfwMarketReport[] }> {
  await ensureDfwReportsSchema();
  const rows = (await getSql()`
    SELECT r.* FROM dfw_market_reports r
    JOIN (SELECT board, area_key, MAX(month) AS month FROM dfw_market_reports GROUP BY board, area_key) m
      ON m.board = r.board AND m.area_key = r.area_key AND m.month = r.month
    ORDER BY r.board, r.area_type, r.area_label
  `) as Row[];
  const months: Record<DfwBoard, string | null> = { metrotex: null, gfwar: null };
  const reports = rows.map((r) => {
    if (!months[r.board] || r.month > (months[r.board] as string)) months[r.board] = r.month;
    return {
      board: r.board, areaType: r.area_type, areaKey: r.area_key, areaLabel: r.area_label, month: r.month,
      metrics: r.metrics ?? {}, sourceUrl: r.source_url, imageUrl: r.image_url, imageUrlEs: r.image_url_es,
      updatedAt: r.updated_at,
    };
  });
  return { months, reports };
}
