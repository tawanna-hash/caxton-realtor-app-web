/**
 * /api/cron/scan-fb-page-events
 *
 * Hourly cron that pulls native Facebook Page events via the Graph API
 * /{page-id}/events endpoint and inserts new ones into the events table
 * as `hidden=true, external_source='facebook-graph'` rows for admin review.
 *
 * This is the fallback path to /api/cron/scan-fb-events (Gemini-on-posts).
 * Whenever an admin publishes an event directly through Facebook's native
 * "Create Event" tool — instead of writing a wall post about it — this
 * cron catches it. Both crons can fire on the same event safely: each uses
 * a different external_id (`fb-llm-<postId>` vs `fb-graph-<eventId>`) so
 * the unique constraint allows both rows. The admin can dedupe at review
 * time if it happens to come through twice.
 *
 * Idempotency: external_id is unique-indexed via events_external_uniq, so
 * re-running on the same Page-event is a no-op.
 *
 * Permission needed on the FB_PAGE_ACCESS_TOKEN: pages_read_engagement
 * (already granted for the post-fetch flow).
 *
 * No FB_PAGE_ACCESS_TOKEN configured → cron exits cleanly with skipped=N.
 */

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { listScannablePageIds } from '@/lib/server/social-store';
import { createGraphDetectedEvent } from '@/lib/server/events-store';
import {
  fetchPageEvents,
  type FacebookPageEvent,
} from '@/lib/server/facebook-events';
import {
  FacebookConfigError,
  FacebookFetchError,
} from '@/lib/server/facebook';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';
import { logger } from '@/lib/server/logger';
import type { Publication } from '@/lib/server/events-store';
import type { SocialPub } from '@/lib/server/social-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Each Page → 1 Graph API call + N inserts. Even at 5 Pages × 50 events each
// the run completes in <20s.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const adhocSecret = process.env.BACKFILL_TOKEN;
  if (adhocSecret && auth === `Bearer ${adhocSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

function pubToPublication(pub: SocialPub): Publication {
  if (pub === 'newsline') return 'san_antonio';
  return 'austin';
}

interface PageResult {
  pageId: string;
  pub: SocialPub;
  fetched: number;
  inserted: number;
  duplicates: number;
  errored: number;
  error?: string;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!process.env.FB_PAGE_ACCESS_TOKEN) {
    return NextResponse.json({
      ok: true,
      skipped: 'no-fb-token',
      pages: 0,
      inserted: 0,
    });
  }

  await ensureSchema();

  let pages: Array<{ pageId: string; pub: SocialPub }>;
  try {
    pages = await listScannablePageIds();
  } catch (e) {
    return NextResponse.json(
      { error: 'db error', detail: (e as Error).message },
      { status: 500 },
    );
  }

  if (pages.length === 0) {
    return NextResponse.json({
      ok: true,
      reason: 'no-pages',
      hint: 'Add at least one curated post in /admin/social so a page_id is known.',
      pages: 0,
      inserted: 0,
    });
  }

  const results: PageResult[] = [];
  let totalInserted = 0;
  const newEvents: Array<{ id: number; title: string; pageId: string }> = [];

  for (const { pageId, pub } of pages) {
    const result: PageResult = {
      pageId,
      pub,
      fetched: 0,
      inserted: 0,
      duplicates: 0,
      errored: 0,
    };

    let events: FacebookPageEvent[] = [];
    try {
      events = await fetchPageEvents(pageId);
      result.fetched = events.length;
    } catch (e) {
      result.errored = 1;
      if (e instanceof FacebookConfigError) {
        result.error = `config: ${e.message}`;
      } else if (e instanceof FacebookFetchError) {
        result.error = `graph ${e.status ?? '?'}: ${e.message}`;
      } else {
        result.error = (e as Error).message;
      }
      logger.warn(
        { pageId, err: result.error },
        '[scan-fb-page-events] page fetch failed',
      );
      results.push(result);
      continue;
    }

    for (const ev of events) {
      try {
        const inserted = await createGraphDetectedEvent({
          publication: pubToPublication(pub),
          facebookEventId: ev.id,
          title: ev.name,
          description: ev.description,
          startDate: ev.startTime,
          endDate: ev.endTime,
          location: ev.location,
          link: ev.permalinkUrl,
          imageUrl: ev.coverImageUrl,
        });
        if (inserted) {
          result.inserted++;
          totalInserted++;
          newEvents.push({
            id: inserted.id,
            title: inserted.title,
            pageId,
          });
          try {
            await notifyAdminsPendingEvent({
              eventId: inserted.id,
              title: inserted.title,
              organizer: inserted.organizer,
              source: 'facebook-graph',
              startDate: inserted.startDate,
            });
          } catch (e) {
            logger.warn(
              { eventId: inserted.id, err: (e as Error).message },
              '[scan-fb-page-events] notify failed',
            );
          }
        } else {
          result.duplicates++;
        }
      } catch (e) {
        result.errored++;
        logger.warn(
          { pageId, fbEventId: ev.id, err: (e as Error).message },
          '[scan-fb-page-events] insert failed',
        );
      }
    }

    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    pages: pages.length,
    inserted: totalInserted,
    results,
    newEvents,
  });
}
