// caxton-events-v1
// Vercel Cron triggers this route once a day (see vercel.json). Scrapes the
// HBA Austin (Home Builders Association of Greater Austin) calendar via the
// GrowthZone Atlas API, upserts events into Postgres, and prunes stale rows.
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.
// We validate it so the route can't be triggered by random callers.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { scrapeHba } from '@/lib/hba-scraper';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
// The HBA scrape is API-only (no headless browser) but does one detail call
// per event for descriptions, so 100 events at ~150ms each ≈ 15s. Match the
// other cron routes' 300s budget for symmetry.
export const maxDuration = 300;

async function _GET(req: Request) {
  // ---- auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    // No secret set — refuse rather than expose an open scrape trigger.
    return Response.json(
      {
        error: 'cron_secret_missing',
        message:
          'Set the CRON_SECRET env var on this project to enable the scheduled scraper.',
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const monthsParam = new URL(req.url).searchParams.get('months');
    const months = Math.max(1, Math.min(parseInt(monthsParam || '12', 10) || 12, 12));

    const events = await scrapeHba(months);
    const counts = await upsertEvents(events);
    const pruned = await pruneStale('hba', 30);

    const ms = Date.now() - startedAt;
    console.log(
      `[cron/scrape-hba] ${ms}ms received=${events.length} ` +
      `inserted=${counts.inserted} updated=${counts.updated} pruned=${pruned}`,
    );
    return Response.json({
      ok: true,
      months,
      received: events.length,
      ...counts,
      pruned,
      durationMs: ms,
    });
  } catch (err) {
    console.error('[cron/scrape-hba] failed', err);
    return Response.json(
      {
        error: 'scrape_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export const GET = withScraperRun('scrape-hba', _GET);
