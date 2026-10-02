// Vercel Cron: imports the Dallas/Ft. Worth association calendars (ARBOR, Greater
// Denton/Wise, Granbury, Greater Texoma, Greater Metro West) into the events
// table under publication 'dallas'. Optional ?only=arbor|gdwcar|granbury|texoma|gmwar.
// Auth: Vercel sends `Authorization: Bearer <CRON_SECRET>`.

import { upsertEvents, pruneStale } from '@/lib/events-store';
import { DFW_ASSOCIATION_SCRAPERS, type DfwAssociationKey } from '@/lib/dfw-association-calendars';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: 'cron_secret_missing', message: 'Set CRON_SECRET to enable the scheduled scraper.' }, { status: 503 });
  }
  if ((req.headers.get('authorization') || '') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const only = new URL(req.url).searchParams.get('only');
  const keys = (Object.keys(DFW_ASSOCIATION_SCRAPERS) as DfwAssociationKey[]).filter((k) => !only || k === only);
  const results: Record<string, unknown> = {};
  let failures = 0;
  for (const key of keys) {
    const started = Date.now();
    try {
      const events = await DFW_ASSOCIATION_SCRAPERS[key]();
      const counts = await upsertEvents(events);
      // Only prune when the feed returned rows, so an outage never wipes the calendar.
      const pruned = events.length > 0 ? await pruneStale(key, 30) : 0;
      results[key] = { received: events.length, ...counts, pruned, ms: Date.now() - started };
    } catch (err) {
      failures++;
      console.error(`[cron/scrape-dfw-associations] ${key} failed`, err);
      results[key] = { error: err instanceof Error ? err.message : String(err) };
    }
  }
  return Response.json({ ok: failures === 0, results }, { status: failures === keys.length && keys.length > 0 ? 500 : 200 });
}

export const GET = withScraperRun('scrape-dfw-associations', _GET);
