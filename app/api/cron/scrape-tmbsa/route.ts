// caxton-events-v1
// Vercel Cron triggers this route once a day (see vercel.json). Scrapes the
// TMBSA (Texas Mortgage Bankers San Antonio) calendar from both the WP page
// and Wild Apricot, upserts events into Postgres, and prunes stale rows.
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { scrapeTmbsa } from '@/lib/tmbsa-scraper';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: Request) {
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
    const months = Math.max(1, Math.min(parseInt(monthsParam || '12', 10) || 12, 12));

    const events = await scrapeTmbsa(months);
    const counts = await upsertEvents(events);
    const pruned = await pruneStale('tmbsa', 30);

    const ms = Date.now() - startedAt;
    console.log(
      `[cron/scrape-tmbsa] ${ms}ms received=${events.length} ` +
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
    console.error('[cron/scrape-tmbsa] failed', err);
    return Response.json(
      {
        error: 'scrape_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
