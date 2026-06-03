/**
 * /api/cron/scan-fb-events
 *
 * Hourly cron that sends each unscanned RealtyLine Facebook Page post
 * through Gemini Flash to detect whether it's announcing an event. When
 * a post is detected as an event, a pending row is inserted into the
 * events table (hidden=true, external_source='facebook-llm') for admin
 * review at /admin/events/pending.
 *
 * Idempotency: events.source_post_id is uniquely indexed so re-running
 * on the same post is a no-op (the INSERT ON CONFLICT DO NOTHING in
 * createLLMDetectedEvent handles it, but our query already filters out
 * posts that have any row pointing to them).
 *
 * Non-events still get a "negative" row? No — we leave them unscanned-
 * looking so a future Gemini revision or prompt tweak can re-evaluate.
 * In practice the cost is negligible: a single RealtyLine page generates
 * <100 new posts/month, well inside the Gemini Flash free tier
 * (15 req/min, 1500/day).
 *
 * No GEMINI_API_KEY configured → cron exits cleanly with skipped=N.
 */

import { NextResponse } from 'next/server';
import { ensureSchema } from '@/lib/db';
import { listSocialPostsForLLMScan } from '@/lib/server/social-store';
import { createLLMDetectedEvent } from '@/lib/server/events-store';
import { extractEventFromPost } from '@/lib/server/gemini-event-extract';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';
import { logger } from '@/lib/server/logger';
import type { Publication } from '@/lib/server/events-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Each post → 1 Gemini call (~1-3s) + 1 DB insert. Up to 30 posts/run,
// so 90s is a safe budget under Vercel's max for Pro plan crons.
export const maxDuration = 90;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

/**
 * Map a featured_social_posts.pub value to events.publication.
 * 'both' is rare (manual override) — default to austin so the event
 * still lands somewhere reviewable.
 */
function pubToPublication(pub: 'realtyline' | 'newsline' | 'both'): Publication {
  if (pub === 'newsline') return 'san_antonio';
  return 'austin';
}

/**
 * Skip events Gemini is unsure about. Below this threshold the noise/false-
 * positive rate gets high — admin would just reject them anyway.
 */
const MIN_CONFIDENCE = 0.55;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      ok: true,
      skipped: 'no-gemini-key',
      scanned: 0,
      detected: 0,
    });
  }

  await ensureSchema();

  let posts;
  try {
    posts = await listSocialPostsForLLMScan(30);
  } catch (e) {
    return NextResponse.json(
      { error: 'db error', detail: (e as Error).message },
      { status: 500 },
    );
  }

  let scanned = 0;
  let detected = 0;
  let lowConfidence = 0;
  let nonEvent = 0;
  let errored = 0;
  const errors: Array<{ postId: number; reason: string; detail?: string }> = [];
  const detectedEvents: Array<{ postId: number; title: string; eventId: number }> = [];

  for (const post of posts) {
    scanned++;
    if (!post.message) {
      nonEvent++;
      continue;
    }

    const result = await extractEventFromPost({
      caption: post.message,
      postedAt: post.posted_at,
    });

    // Discriminated-union narrowing: 'ok' only exists on the error
    // variants. Once we've ruled them out, TS sees the remaining
    // union as { isEvent: true|false, … }.
    if ('ok' in result) {
      errored++;
      errors.push({
        postId: post.id,
        reason: result.reason,
        detail: result.detail,
      });
      // Rate-limit → stop hitting Gemini for this run.
      if (result.reason === 'rate-limit') {
        logger.warn(
          { postId: post.id },
          '[scan-fb-events] Gemini rate-limited, aborting run',
        );
        break;
      }
      continue;
    }

    if (!result.isEvent) {
      nonEvent++;
      // Negative result — do NOT insert a row. The post will be
      // re-evaluated on a future cron if the prompt/model improves.
      continue;
    }

    // result is now narrowed to ExtractedEvent (isEvent: true).
    if (result.confidence < MIN_CONFIDENCE) {
      lowConfidence++;
      continue;
    }

    let inserted;
    try {
      inserted = await createLLMDetectedEvent({
        publication: pubToPublication(post.pub),
        title: result.title,
        description: post.message,
        startDate: result.startDate,
        endDate: result.endDate,
        location: result.location,
        link: post.permalink_url,
        imageUrl: post.image_url,
        organizer: result.organizer,
        confidence: result.confidence,
        sourcePostId: post.id,
      });
    } catch (e) {
      errored++;
      errors.push({
        postId: post.id,
        reason: 'db-insert',
        detail: (e as Error).message,
      });
      continue;
    }

    // null = already inserted on a prior run (ON CONFLICT DO NOTHING).
    // Filter excluded these so this is defensive.
    if (!inserted) continue;

    detected++;
    detectedEvents.push({
      postId: post.id,
      title: inserted.title,
      eventId: inserted.id,
    });

    // Fire-and-forget admin notification. We don't await failures past
    // their own try/catch because the event is already in the queue.
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
        '[scan-fb-events] notify failed',
      );
    }
  }

  return NextResponse.json({
    ok: true,
    scanned,
    detected,
    nonEvent,
    lowConfidence,
    errored,
    errors: errors.slice(0, 10),
    detectedEvents,
  });
}
