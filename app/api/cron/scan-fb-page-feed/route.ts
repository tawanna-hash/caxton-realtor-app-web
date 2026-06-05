/**
 * /api/cron/scan-fb-page-feed
 *
 * Hourly cron that pulls recent posts from each configured Facebook Page
 * (via Graph API /{page-id}/posts) and runs Gemini Flash on each one to
 * detect events. Inserts detected events as `hidden=true,
 * external_source='facebook-llm'` rows with external_id `fb-llm-feed-<id>`.
 *
 * Differs from /api/cron/scan-fb-events: that cron requires admins to first
 * curate a post via /admin/social. This one does NOT — every recent post on
 * a configured Page is auto-scanned. So Caroline's RealtyLine event flyers
 * land in the pending queue automatically without anyone clicking anything.
 *
 * Configure which Pages to scan via env var FB_PAGE_IDS:
 *   FB_PAGE_IDS="123456789:realtyline,987654321:newsline"
 *
 * Skips:
 *   - No FB_PAGE_ACCESS_TOKEN              → exit clean (skipped='no-fb-token')
 *   - No FB_PAGE_IDS                       → exit clean (skipped='no-pages-configured')
 *   - No GEMINI_API_KEY                    → exit clean (skipped='no-gemini-key')
 *   - Post.message empty or <20 chars      → skip (nothing for Gemini to read)
 *   - Post already scanned (idempotency)   → skip (no duplicate Gemini call)
 *
 * Rate-limit: Gemini Flash free tier is 15 req/min, 1500/day. Hourly cron
 * with maxPostsPerRun=30 stays well inside that budget.
 */

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import {
  fetchPagePosts,
  listConfiguredPages,
  type FacebookPagePost,
  type ScannablePage,
} from '@/lib/server/facebook-events';
import {
  FacebookConfigError,
  FacebookFetchError,
} from '@/lib/server/facebook';
import {
  createFeedPostDetectedEvent,
  hasScannedFbPost,
} from '@/lib/server/events-store';
import { extractEventFromPost } from '@/lib/server/gemini-event-extract';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';
import { logger } from '@/lib/server/logger';
import type { Publication } from '@/lib/server/events-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Each post → 1 Gemini call (~1-3s) + 1 DB insert. Up to 30 posts/run,
// so 90s is a safe budget under Vercel's max for Pro plan crons.
export const maxDuration = 90;

const MIN_CONFIDENCE = 0.55;
const MAX_POSTS_PER_RUN = 30;

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const adhocSecret = process.env.BACKFILL_TOKEN;
  if (adhocSecret && auth === `Bearer ${adhocSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

function pubToPublication(pub: ScannablePage['pub']): Publication {
  if (pub === 'newsline') return 'san_antonio';
  return 'austin';
}

interface PageResult {
  pageId: string;
  pub: ScannablePage['pub'];
  fetched: number;
  scanned: number;
  detected: number;
  alreadyScanned: number;
  nonEvent: number;
  lowConfidence: number;
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
      hint: 'Set FB_PAGE_ACCESS_TOKEN in Vercel. See docs/FACEBOOK_SETUP.md.',
    });
  }
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ ok: true, skipped: 'no-gemini-key' });
  }

  const pages = listConfiguredPages();
  if (pages.length === 0) {
    return NextResponse.json({
      ok: true,
      skipped: 'no-pages-configured',
      hint: 'Set FB_PAGE_IDS="<pageId>:<pub>,..." in Vercel env.',
    });
  }

  await ensureSchema();

  const results: PageResult[] = [];
  const newEvents: Array<{ id: number; title: string; pageId: string }> = [];
  let geminiBudget = MAX_POSTS_PER_RUN;
  let rateLimited = false;

  for (const { pageId, pub } of pages) {
    const r: PageResult = {
      pageId,
      pub,
      fetched: 0,
      scanned: 0,
      detected: 0,
      alreadyScanned: 0,
      nonEvent: 0,
      lowConfidence: 0,
      errored: 0,
    };

    if (geminiBudget <= 0 || rateLimited) {
      r.error = rateLimited ? 'gemini-rate-limit' : 'gemini-budget-exhausted';
      results.push(r);
      continue;
    }

    let posts: FacebookPagePost[] = [];
    try {
      posts = await fetchPagePosts(pageId);
      r.fetched = posts.length;
    } catch (e) {
      r.errored = 1;
      if (e instanceof FacebookConfigError) {
        r.error = `config: ${e.message}`;
      } else if (e instanceof FacebookFetchError) {
        r.error = `graph ${e.status ?? '?'}: ${e.message}`;
      } else {
        r.error = (e as Error).message;
      }
      logger.warn(
        { pageId, err: r.error },
        '[scan-fb-page-feed] page fetch failed',
      );
      results.push(r);
      continue;
    }

    for (const post of posts) {
      if (geminiBudget <= 0) break;
      if (!post.message || post.message.length < 20) {
        r.nonEvent++;
        continue;
      }
      // Idempotency check before burning a Gemini call.
      if (await hasScannedFbPost(post.fbPostId)) {
        r.alreadyScanned++;
        continue;
      }

      r.scanned++;
      geminiBudget--;

      const result = await extractEventFromPost({
        caption: post.message,
        postedAt: post.postedAt,
      });

      if ('ok' in result) {
        r.errored++;
        if (result.reason === 'rate-limit') {
          rateLimited = true;
          logger.warn(
            { pageId, fbPostId: post.fbPostId },
            '[scan-fb-page-feed] Gemini rate-limited, aborting',
          );
          break;
        }
        continue;
      }

      if (!result.isEvent) {
        r.nonEvent++;
        continue;
      }
      if (result.confidence < MIN_CONFIDENCE) {
        r.lowConfidence++;
        continue;
      }

      let inserted;
      try {
        inserted = await createFeedPostDetectedEvent({
          publication: pubToPublication(pub),
          fbPostId: post.fbPostId,
          title: result.title,
          description: post.message,
          startDate: result.startDate,
          endDate: result.endDate,
          location: result.location,
          link: post.permalinkUrl,
          imageUrl: post.imageUrl,
          organizer: result.organizer,
          confidence: result.confidence,
        });
      } catch (e) {
        r.errored++;
        logger.warn(
          { pageId, fbPostId: post.fbPostId, err: (e as Error).message },
          '[scan-fb-page-feed] insert failed',
        );
        continue;
      }
      if (!inserted) continue;

      r.detected++;
      newEvents.push({ id: inserted.id, title: inserted.title, pageId });

      try {
        await notifyAdminsPendingEvent({
          eventId: inserted.id,
          title: inserted.title,
          organizer: inserted.organizer,
          source: 'facebook-llm',
          startDate: inserted.startDate,
        });
      } catch (e) {
        logger.warn(
          { eventId: inserted.id, err: (e as Error).message },
          '[scan-fb-page-feed] notify failed',
        );
      }
    }

    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    pages: pages.length,
    geminiBudgetUsed: MAX_POSTS_PER_RUN - geminiBudget,
    rateLimited,
    results,
    newEvents,
  });
}
