// lib/with-scraper-run.ts
//
// Higher-order wrapper for /api/cron/(scrape|sync)-* route handlers.
// Times the call, runs the handler, best-effort extracts counters from
// the JSON response body, and records the outcome in scraper_runs.
//
// Usage:
//   const _GET = async (req: NextRequest) => { ... };
//   export const GET = withScraperRun('scrape-kb-home', _GET);
//   export async function POST(req: NextRequest) { return GET(req); }
//
// Contract:
//   - Recording never throws (recordScraperRun swallows errors).
//   - HTTP 401 (auth failure) and 503 (config missing) are NOT recorded
//     — those are external-configuration noise, not scraper outcomes.
//   - Thrown exceptions inside the handler are recorded as 'error' AND
//     re-thrown so Next's error surface remains intact.
//   - Counter fields understood (any subset may be present):
//       rowCount, upserted, inserted, created, updated, deactivated,
//       stripped, rawCount, normalized, scraped, received, pruned
//     Mapping to the scraper_runs schema is defensive — missing fields
//     default to 0.

import { recordScraperRun, type ScraperRunStatus } from './scraper-runs';

// Handler is generic over the request type so both `Request` and
// `NextRequest` route handlers can be wrapped without a type conflict.
type Handler<Req extends Request = Request> = (req: Req) => Promise<Response>;

// Best-effort read of a numeric field on a plain-object body.
function num(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// Some routes nest counters under `summary` (e.g. scrape-kb-home). Merge
// the top level and one level of `summary`/`counts`/`result` so counter
// extraction just works.
function flatten(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') return {};
  const top = body as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...top };
  for (const nestKey of ['summary', 'counts', 'result']) {
    const nested = top[nestKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(merged, nested as Record<string, unknown>);
    }
  }
  return merged;
}

export function withScraperRun<Req extends Request>(
  scraperPath: string,
  handler: Handler<Req>,
): Handler<Req> {
  return async (req: Req): Promise<Response> => {
    const startedAt = Date.now();
    let res: Response;

    try {
      res = await handler(req);
    } catch (err) {
      // Handler crashed. Record + rethrow.
      await recordScraperRun({
        scraperPath,
        durationMs: Date.now() - startedAt,
        status: 'error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    // Skip auth/config noise — those aren't scraper outcomes.
    if (res.status === 401 || res.status === 503) return res;

    // Clone so we can read the body without draining the response we
    // return to the caller.
    let body: unknown = null;
    try {
      body = await res.clone().json();
    } catch {
      // Non-JSON body — record what we can, no counters.
    }

    const flat = flatten(body);
    const ok = res.status >= 200 && res.status < 300 && (flat.ok !== false);

    const rowCount =
      num(flat, 'rowCount') ??
      num(flat, 'upserted') ??
      num(flat, 'inserted') ??
      num(flat, 'normalized') ??
      num(flat, 'scraped') ??
      num(flat, 'received') ??
      0;

    const rawCount    = num(flat, 'rawCount')    ?? 0;
    const created     = num(flat, 'created')     ?? num(flat, 'inserted') ?? 0;
    const updated     = num(flat, 'updated')     ?? 0;
    const deactivated = num(flat, 'deactivated') ?? num(flat, 'pruned')   ?? 0;

    const status: ScraperRunStatus = !ok
      ? 'error'
      : rowCount === 0 && rawCount === 0
        ? 'skipped'
        : 'ok';

    const errorMessage: string | null = !ok
      ? (typeof flat.error === 'string' && flat.error) ||
        (typeof flat.message === 'string' && flat.message) ||
        `HTTP ${res.status}`
      : null;

    await recordScraperRun({
      scraperPath,
      durationMs: Date.now() - startedAt,
      status,
      rowCount,
      rawCount,
      created,
      updated,
      deactivated,
      errorMessage,
    });

    return res;
  };
}
