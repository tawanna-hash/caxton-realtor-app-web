// caxton-events-v1
// Vercel Cron triggers this route once a day (see vercel.json). Scans the
// connected Gmail mailbox for event announcements from advertisers and
// curated association domains, and queues each detection for admin review.
// Auth: Vercel includes `Authorization: Bearer <CRON_SECRET>` on cron pings.
// We validate it so the route can't be triggered by random callers.

import { scanGmailForEvents } from '@/lib/server/gmail-event-scanner';

export const runtime = 'nodejs';
// Gemini call per unscanned message plus a geocode per detection — the same
// runtime budget the other daily scrapers use.
export const maxDuration = 300;

// The cron runs daily over a 30-day rolling window. The wide overlap covers
// missed runs and back-dated newsletters that mention an upcoming event weeks
// before it happens. Re-scanned messages are skipped before the Gemini call,
// so re-reading the same month every day costs almost nothing.
const DEFAULT_LOOKBACK_DAYS = 30;

// Callers can widen the window for a one-off backfill via `?days=`.
const MAX_LOOKBACK_DAYS = 90;

export async function GET(req: Request) {
  // ---- auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  } else {
    // No secret set — refuse rather than expose an open scan trigger.
    return Response.json(
      {
        error: 'cron_secret_missing',
        message:
          'Set the CRON_SECRET env var on this project to enable the scheduled scanner.',
      },
      { status: 503 },
    );
  }

  const startedAt = Date.now();
  try {
    const daysParam = new URL(req.url).searchParams.get('days');
    const lookbackDays = Math.max(
      1,
      Math.min(parseInt(daysParam || '', 10) || DEFAULT_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS),
    );

    const result = await scanGmailForEvents({ lookbackDays });

    const ms = Date.now() - startedAt;
    if (!result.mailbox) {
      console.warn('[cron/scan-gmail] no Gmail mailbox connected — nothing to scan');
    }
    console.log(
      `[cron/scan-gmail] ${ms}ms lookback=${lookbackDays}d domains=${result.domains} ` +
      `scanned=${result.scanned} detected=${result.detected} inserted=${result.inserted} ` +
      `dupes=${result.skippedDuplicate} nodate=${result.skippedNoDate} errors=${result.errors}`,
    );
    return Response.json({ ok: true, ...result, durationMs: ms });
  } catch (err) {
    console.error('[cron/scan-gmail] failed', err);
    return Response.json(
      {
        error: 'scan_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
