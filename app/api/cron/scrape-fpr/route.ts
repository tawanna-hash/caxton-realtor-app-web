// caxton-events-v1
// Vercel Cron triggers this route once a day (see vercel.json). Scrapes the
// Five Points Board of REALTORS calendar widget, upserts events into Postgres,
// and prunes stale rows.
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.
// We validate it so the route can't be triggered by random callers.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { scrapeFpr } from '@/lib/fpr-scraper';

export const runtime = 'nodejs';
// Plain HTTP fetch + regex extract — no headless browser needed since the
// calendar page embeds the full event list as inline JS variables. Matches
// the unlockmls scraper's runtime budget for symmetry across cron jobs.
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
    // FPR's RAPAMS widget exposes the full 12-month rolling window in one
    // shot, so 12 is the natural default. `months` post-filters the result.
    const monthsParam = new URL(req.url).searchParams.get('months');
    const months = Math.max(1, Math.min(parseInt(monthsParam || '12', 10) || 12, 12));

    const events = await scrapeFpr(months);
    const counts = await upsertEvents(events);
    const pruned = await pruneStale('fpr', 30);

    const ms = Date.now() - startedAt;
    console.log(
      `[cron/scrape-fpr] ${ms}ms received=${events.length} ` +
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
    console.error('[cron/scrape-fpr] failed', err);
    return Response.json(
      {
        error: 'scrape_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

