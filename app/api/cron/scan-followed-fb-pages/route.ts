/**
 * /api/cron/scan-followed-fb-pages
 *
 * Scans Pages-I-follow (curated via monitored_fb_pages table) using headless
 * Chromium + Gemini. Unlike scan-fb-page-feed, these are Pages we don't admin,
 * so no Graph API token works — we have to load the public mobile site as a
 * normal browser would and extract post text from the DOM.
 *
 * Design:
 *   - 1 Page per cron tick (rotates oldest-first via last_scanned_at)
 *     → keeps each run under Vercel's 90s function budget
 *     → scheduled hourly, so a list of 12 Pages cycles every 12 hours
 *   - Loads https://m.facebook.com/{slug}/posts/ (mobile DOM is lighter)
 *   - Extracts up to 8 most-recent post text snippets
 *   - Dedupes by hash(slug + first-120-chars) against events_external_uniq
 *   - Feeds new posts to Gemini → creates `facebook-graph` pending events
 *   - Records last_scanned_at, last_post_count, last_detected, last_error
 *
 * Authorization:
 *   - Bearer CRON_SECRET   (Vercel cron)
 *   - Bearer BACKFILL_TOKEN (manual triggering)
 *   - x-vercel-cron: 1     (Vercel cron header fallback)
 */

import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { ensureSchema } from '@/lib/db';
import {
  listDueMonitoredFbPages,
  recordMonitoredFbPageScan,
  type MonitoredFbPage,
} from '@/lib/server/monitored-fb-pages-store';
import {
  createFeedPostDetectedEvent,
  hasScannedFbPost,
} from '@/lib/server/events-store';
import { extractEventFromPost } from '@/lib/server/gemini-event-extract';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';
import { logger } from '@/lib/server/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Chromium cold start (~3-5s) + 1 Page load (~10-15s) + ≤8 Gemini calls
// (~3s each). One Page/tick keeps us well under Vercel's 90s ceiling.
export const maxDuration = 90;

const MAX_PAGES_PER_RUN = 1;
const MAX_POSTS_PER_PAGE = 8;
const MIN_POST_CHARS = 30;
const MIN_CONFIDENCE = 0.55;
const NAV_TIMEOUT_MS = 25_000;

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
  'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 ' +
  'Mobile/15E148 Safari/604.1';

function authorized(req: Request): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const adhocSecret = process.env.BACKFILL_TOKEN;
  if (adhocSecret && auth === `Bearer ${adhocSecret}`) return true;
  return req.headers.get('x-vercel-cron') === '1';
}

interface ExtractedPost {
  text: string;
  hash: string; // stable id for dedupe: sha256(slug + first 120 chars)
  imageUrl: string | null;
  permalink: string | null;
}

interface PageResult {
  slug: string;
  label: string;
  fetched: number;
  scanned: number;
  detected: number;
  alreadyScanned: number;
  nonEvent: number;
  lowConfidence: number;
  errored: number;
  errorSamples: string[];
  fatalError: string | null;
}

/**
 * Headless Chromium loader. Lazy-imported so the function bundle stays
 * small for non-Chromium routes. Sparticuz + playwright-core is the
 * Vercel-supported combo (puppeteer's bundled Chromium is too big).
 */
async function launchBrowser() {
  const chromium = (await import('@sparticuz/chromium')).default;
  const { chromium: playwrightChromium } = await import('playwright-core');
  const executablePath = await chromium.executablePath();
  const browser = await playwrightChromium.launch({
    args: chromium.args,
    executablePath,
    headless: true,
  });
  return browser;
}

/**
 * Loads m.facebook.com/{slug}/posts and pulls visible post text.
 *
 * FB's mobile HTML is notoriously volatile — they ship new DOM markers
 * regularly. We use a *defensive* extractor: collect every <div> that
 * looks "post-shaped" (≥ MIN_POST_CHARS of text, has some user-generated
 * structure), then dedupe by content hash. Some chrome ("Like · Comment ·
 * Share" lines) will sneak in; Gemini filters those out as non-events.
 */
async function extractPostsForPage(slug: string): Promise<ExtractedPost[]> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: MOBILE_UA,
      viewport: { width: 390, height: 844 },
      locale: 'en-US',
      timezoneId: 'America/Chicago',
      // Block heavy assets — we only need the HTML/text.
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Block images/fonts/media so the page is lighter and faster.
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (type === 'image' || type === 'media' || type === 'font') {
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    const url = `https://m.facebook.com/${encodeURIComponent(slug)}/posts/`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // Give FB a moment to hydrate post text. They lazy-render via JS.
    await page.waitForTimeout(2500);

    // Detect login wall: FB sometimes redirects logged-out anons to /login.
    const currentUrl = page.url();
    if (/\/login|\/checkpoint|\/recover/.test(currentUrl)) {
      throw new Error(`login wall: redirected to ${currentUrl}`);
    }

    // Extract text candidates from the DOM. We grab any element matching
    // story-shaped containers, plus a general fallback that scoops all
    // sufficiently-long <div> innerText blocks.
    const rawCandidates = await page.evaluate(() => {
      const out: Array<{ text: string; permalink: string | null }> = [];
      const seen = new Set<string>();

      const pushCandidate = (el: Element, permalink: string | null) => {
        const text = (el as HTMLElement).innerText?.trim() ?? '';
        if (text.length < 30) return;
        const k = text.slice(0, 80);
        if (seen.has(k)) return;
        seen.add(k);
        out.push({ text, permalink });
      };

      // 1. Best signal: anything containing a permalink to /story.php or
      //    /<slug>/posts/<id> is almost certainly a post container.
      const links = Array.from(
        document.querySelectorAll(
          'a[href*="/story.php"], a[href*="/posts/"], a[href*="/permalink/"]'
        )
      ) as HTMLAnchorElement[];
      for (const a of links) {
        // Walk up to a sensible container (the closest <article> or
        // a div with substantial text content).
        let node: Element | null = a;
        for (let i = 0; i < 6 && node; i += 1) {
          if (node.tagName === 'ARTICLE') break;
          const text = (node as HTMLElement).innerText?.trim() ?? '';
          if (text.length >= 80) break;
          node = node.parentElement;
        }
        if (node) pushCandidate(node, a.href);
      }

      // 2. Fallback: <article> elements (FB sometimes still uses these).
      const articles = Array.from(document.querySelectorAll('article'));
      for (const art of articles) pushCandidate(art, null);

      return out;
    });

    return rawCandidates.slice(0, 16).map((c) => {
      const text = c.text.replace(/\s+/g, ' ').trim();
      const fingerprint = `${slug}|${text.slice(0, 120)}`;
      const hash = createHash('sha256').update(fingerprint).digest('hex').slice(0, 32);
      return { text, hash, imageUrl: null, permalink: c.permalink };
    });
  } finally {
    await browser.close().catch(() => {});
  }
}

async function scanPage(p: MonitoredFbPage): Promise<PageResult> {
  const result: PageResult = {
    slug: p.slug,
    label: p.label,
    fetched: 0,
    scanned: 0,
    detected: 0,
    alreadyScanned: 0,
    nonEvent: 0,
    lowConfidence: 0,
    errored: 0,
    errorSamples: [],
    fatalError: null,
  };

  let posts: ExtractedPost[];
  try {
    posts = await extractPostsForPage(p.slug);
  } catch (err) {
    result.fatalError = err instanceof Error ? err.message : String(err);
    return result;
  }

  result.fetched = posts.length;
  const candidates = posts
    .filter((post) => post.text.length >= MIN_POST_CHARS)
    .slice(0, MAX_POSTS_PER_PAGE);

  for (const post of candidates) {
    // hasScannedFbPost reads from events.external_id = 'fb-llm-feed-<id>'.
    // We piggyback on that namespace by using the hash as the fbPostId.
    if (await hasScannedFbPost(post.hash)) {
      result.alreadyScanned += 1;
      continue;
    }

    result.scanned += 1;

    const extracted = await extractEventFromPost({
      caption: post.text,
      postedAt: null,
    });

    // ExtractResult is a discriminated union: { ok: false, reason, detail }
    // for failures, otherwise { isEvent: true|false, ... }. Narrow on 'ok'
    // first so TS sees the remaining branch has isEvent.
    if ('ok' in extracted) {
      result.errored += 1;
      if (result.errorSamples.length < 3) {
        result.errorSamples.push(`${extracted.reason}: ${extracted.detail ?? ''}`);
      }
      continue;
    }

    if (!extracted.isEvent) {
      result.nonEvent += 1;
      continue;
    }

    if (extracted.confidence < MIN_CONFIDENCE) {
      result.lowConfidence += 1;
      continue;
    }

    try {
      const event = await createFeedPostDetectedEvent({
        publication: p.pub,
        fbPostId: post.hash,
        title: extracted.title,
        description: post.text.slice(0, 1000),
        startDate: extracted.startDate,
        endDate: extracted.endDate,
        location: extracted.location,
        link: post.permalink ?? `https://www.facebook.com/${p.slug}`,
        imageUrl: post.imageUrl,
        organizer: extracted.organizer ?? p.label,
        confidence: extracted.confidence,
      });
      if (event) {
        result.detected += 1;
        await notifyAdminsPendingEvent({
          eventId: event.id,
          title: event.title,
          organizer: event.organizer ?? null,
          source: 'facebook-llm',
          startDate: event.startDate,
        }).catch((err) => {
          logger.warn({ err }, '[scan-followed-fb-pages] notify failed');
        });
      } else {
        result.alreadyScanned += 1;
      }
    } catch (err) {
      result.errored += 1;
      if (result.errorSamples.length < 3) {
        result.errorSamples.push(
          `insert-failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  await ensureSchema();

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ skipped: 'no-gemini-key' });
  }

  const due = await listDueMonitoredFbPages(MAX_PAGES_PER_RUN);
  if (due.length === 0) {
    return NextResponse.json({ skipped: 'no-active-pages' });
  }

  const results: PageResult[] = [];
  for (const p of due) {
    const r = await scanPage(p);
    results.push(r);
    await recordMonitoredFbPageScan({
      id: p.id,
      postCount: r.fetched,
      detected: r.detected,
      error: r.fatalError ?? (r.errored > 0 ? r.errorSamples.join(' | ') : null),
    });
  }

  return NextResponse.json({
    pages: results.length,
    results,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
