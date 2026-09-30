// Vercel Cron triggers this route once a day (see vercel.json). Pulls the
// MetroTex Association of REALTORS® public event feed (Dallas/Ft. Worth),
// upserts events into Postgres under publication 'dallas', and prunes
// future rows that disappeared from the feed (cancelled/removed).
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { scrapeMetroTex } from '@/lib/metrotex-scraper';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: 'cron_secret_missing', message: 'Set the CRON_SECRET env var to enable the scheduled import.' },
      { status: 503 },
    );
  }
  if ((req.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const events = await scrapeMetroTex();
    const counts = await upsertEvents(events);
    // Only prune when the feed returned data, so a feed outage can't wipe
    // the Dallas calendar.
    const pruned = events.length > 0 ? await pruneStale('metrotex', 30) : 0;
    const ms = Date.now() - startedAt;
    console.log(
      `[cron/scrape-metrotex] ${ms}ms received=${events.length} ` +
        `inserted=${counts.inserted} updated=${counts.updated} pruned=${pruned}`,
    );
    return Response.json({ ok: true, received: events.length, ...counts, pruned, durationMs: ms });
  } catch (err) {
    console.error('[cron/scrape-metrotex] failed', err);
    return Response.json(
      { error: 'scrape_failed', message: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const GET = withScraperRun('scrape-metrotex', _GET);
// The admin Scraper Hub "Run now" button calls cron routes with POST.
export const POST = GET;
