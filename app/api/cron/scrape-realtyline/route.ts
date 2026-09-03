import { syncRealtyLineCalendar } from '@/lib/realtyline-calendar-scraper';
import { withScraperRun } from '@/lib/with-scraper-run';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function _GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json({ error: 'cron_secret_missing' }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await syncRealtyLineCalendar();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[cron/scrape-realtyline] ${durationMs}ms received=${result.received} ` +
      `inserted=${result.inserted} updated=${result.updated} ` +
      `skipped=${result.skippedExisting} pruned=${result.pruned}`,
    );
    return Response.json({ ok: true, ...result, durationMs });
  } catch (error) {
    console.error('[cron/scrape-realtyline] failed', error);
    return Response.json(
      {
        error: 'scrape_failed',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export const GET = withScraperRun('scrape-realtyline', _GET);
