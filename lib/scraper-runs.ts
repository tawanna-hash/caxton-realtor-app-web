// lib/scraper-runs.ts
//
// Persist the outcome of a scraper run so /admin/content/scrapers can
// show a "last run" line per scraper. One row per scraper_path — the
// latest run overwrites the previous one (see 20260821-scraper-runs.sql
// for the design rationale).
//
// Used by /api/ingest/scrape-hollows tonight; will be dropped into the
// 32 Vercel cron routes in a follow-up patch.
//
// Failures inside recordScraperRun MUST NOT break the caller — logging
// only. The admin surface being stale is far less bad than a scraper
// failing because it couldn't write a metadata row.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export type ScraperRunStatus = 'ok' | 'error' | 'skipped';

export type ScraperRunInput = {
  scraperPath: string;      // e.g. "scrape-hollows" (no /api/cron/ prefix)
  durationMs: number;
  status: ScraperRunStatus;
  rowCount?: number;        // rows successfully upserted
  rawCount?: number;        // rows the scraper saw before dedupe/skip
  created?: number;
  updated?: number;
  deactivated?: number;
  errorMessage?: string | null;
};

export async function recordScraperRun(input: ScraperRunInput): Promise<void> {
  try {
    await sql`
      INSERT INTO scraper_runs (
        scraper_path, last_run_at, duration_ms, status,
        row_count, raw_count, created, updated, deactivated, error_message
      )
      VALUES (
        ${input.scraperPath},
        now(),
        ${input.durationMs},
        ${input.status},
        ${input.rowCount ?? 0},
        ${input.rawCount ?? 0},
        ${input.created ?? 0},
        ${input.updated ?? 0},
        ${input.deactivated ?? 0},
        ${input.errorMessage ?? null}
      )
      ON CONFLICT (scraper_path) DO UPDATE SET
        last_run_at   = EXCLUDED.last_run_at,
        duration_ms   = EXCLUDED.duration_ms,
        status        = EXCLUDED.status,
        row_count     = EXCLUDED.row_count,
        raw_count     = EXCLUDED.raw_count,
        created       = EXCLUDED.created,
        updated       = EXCLUDED.updated,
        deactivated   = EXCLUDED.deactivated,
        error_message = EXCLUDED.error_message
    `;
  } catch (err) {
    // Metadata write must never fail the caller.
    console.error(
      `[scraper-runs] failed to record run for ${input.scraperPath}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export type ScraperRunRow = {
  scraperPath: string;
  lastRunAt: string;    // ISO
  durationMs: number;
  status: ScraperRunStatus;
  rowCount: number;
  rawCount: number;
  created: number;
  updated: number;
  deactivated: number;
  errorMessage: string | null;
};

export async function listScraperRuns(): Promise<ScraperRunRow[]> {
  try {
    const rows = (await sql`
      SELECT scraper_path, last_run_at, duration_ms, status,
             row_count, raw_count, created, updated, deactivated, error_message
      FROM scraper_runs
      ORDER BY last_run_at DESC
    `) as Array<{
      scraper_path: string;
      last_run_at: string | Date;
      duration_ms: number;
      status: ScraperRunStatus;
      row_count: number;
      raw_count: number;
      created: number;
      updated: number;
      deactivated: number;
      error_message: string | null;
    }>;
    return rows.map((r) => ({
      scraperPath: r.scraper_path,
      lastRunAt: r.last_run_at instanceof Date ? r.last_run_at.toISOString() : r.last_run_at,
      durationMs: r.duration_ms,
      status: r.status,
      rowCount: r.row_count,
      rawCount: r.raw_count,
      created: r.created,
      updated: r.updated,
      deactivated: r.deactivated,
      errorMessage: r.error_message,
    }));
  } catch (err) {
    console.error('[scraper-runs] list failed:', err instanceof Error ? err.message : String(err));
    return [];
  }
}
