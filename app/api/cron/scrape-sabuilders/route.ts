// caxton-events-v1
// Vercel Cron triggers this route once a day (see vercel.json). Scrapes the
// GSABA (Greater San Antonio Builders Association) calendar, upserts events
// into Postgres, and prunes stale rows.
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { scrapeSabuilders } from '@/lib/sabuilders-scraper';

export const runtime = 'nodejs';
// GSABA walks N month pages and fetches per-event ICS + HTML — keep the
// generous 300s budget so a slow upstream day doesn't kill the run.
export const maxDuration = 300;

export async function GET(req: Request) {
  // ---- auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
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
    const months = Math.max(1, Math.min(parseInt(monthsParam || '3', 10) || 3, 12));

    const events = await scrapeSabuilders(months);
    const counts = await upsertEvents(events);
    const pruned = await pruneStale('sabuilders', 30);

    const ms = Date.now() - startedAt;
    console.log(
      `[cron/scrape-sabuilders] ${ms}ms received=${events.length} ` +
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
    console.error('[cron/scrape-sabuilders] failed', err);
    return Response.json(
      {
        error: 'scrape_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
