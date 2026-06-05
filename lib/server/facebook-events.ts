/**
 * Facebook Graph API helpers for fetching Page-owned events.
 *
 * Complement to /lib/server/facebook.ts (which fetches Page posts). Pages we
 * administer expose their /events endpoint via the same long-lived Page
 * Access Token used for posts. Permission needed: pages_read_engagement
 * (already granted for the post-fetch flow).
 *
 * Used by the /api/cron/scan-fb-page-events cron as a fallback path when
 * Gemini-on-FB-posts (Path D) misses an event that the admin published
 * directly via Facebook's native event tool. Detected events land in the
 * pending queue with external_source='facebook-graph'.
 */
import {
  FacebookConfigError,
  FacebookFetchError,
} from '@/lib/server/facebook';

const DEFAULT_GRAPH_VERSION = 'v20.0';

export interface FacebookPageEvent {
  /** Numeric Facebook event ID — used to build external_id. */
  id: string;
  name: string;
  description: string | null;
  /** ISO timestamps from Graph API (kept verbatim — events-store normalizes). */
  startTime: string | null;
  endTime: string | null;
  /** Best-effort flattened venue string — see `flattenPlace` below. */
  location: string | null;
  /** Cover image (high-res). null when the event has no cover photo. */
  coverImageUrl: string | null;
  /** Permalink the admin queue can link to. */
  permalinkUrl: string;
}

/** Subset of the place sub-object we care about. */
interface PlaceRaw {
  name?: string;
  location?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
}

interface EventRaw {
  id: string;
  name?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  place?: PlaceRaw;
  cover?: { source?: string };
}

interface EventsResponse {
  data: EventRaw[];
  paging?: { next?: string };
}

/**
 * Squash a Graph API place object into a single human-readable address
 * string for the events.location column. Falls back to just the venue name
 * when no address parts are present.
 */
function flattenPlace(place: PlaceRaw | undefined): string | null {
  if (!place) return null;
  const name = place.name?.trim();
  const loc = place.location;
  const parts: string[] = [];
  if (loc?.street) parts.push(loc.street.trim());
  const cityStateZip = [loc?.city, loc?.state, loc?.zip].filter(Boolean).join(', ');
  if (cityStateZip) parts.push(cityStateZip);
  const address = parts.join(', ');
  if (name && address) return `${name}, ${address}`;
  return name || address || null;
}

/**
 * Fetch all upcoming + recent events for a single Page.
 *
 * Returns events whose start_time is in the future OR within the past
 * `lookbackDays` window — admins occasionally want to backfill recently-
 * concluded events (e.g. a happy hour they forgot to add to the calendar).
 *
 * Defaults to 14-day lookback + all future events, capped at 50 to keep
 * each cron run quick.
 */
export async function fetchPageEvents(
  pageId: string,
  opts: {
    token?: string;
    graphVersion?: string;
    lookbackDays?: number;
    limit?: number;
  } = {},
): Promise<FacebookPageEvent[]> {
  const token = opts.token ?? process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new FacebookConfigError(
      'FB_PAGE_ACCESS_TOKEN is not set. See docs/FACEBOOK_SETUP.md for setup.',
    );
  }
  const version = opts.graphVersion ?? process.env.FB_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
  const lookbackDays = opts.lookbackDays ?? 14;
  const limit = Math.min(opts.limit ?? 50, 100);

  // since= cutoff: events with start_time >= (now - lookbackDays). Graph API
  // accepts a unix timestamp here.
  const sinceUnix = Math.floor(Date.now() / 1000) - lookbackDays * 86_400;

  const fields = [
    'id',
    'name',
    'description',
    'start_time',
    'end_time',
    'place',
    'cover{source}',
  ].join(',');

  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/events` +
    `?fields=${encodeURIComponent(fields)}` +
    `&since=${sinceUnix}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: { message?: string; type?: string } };
      detail = j.error?.message ?? '';
    } catch {
      detail = await res.text();
    }
    throw new FacebookFetchError(
      `Graph API ${res.status}: ${detail || 'unknown error'} (Page ${pageId})`,
      res.status,
    );
  }

  const body = (await res.json()) as EventsResponse;
  const events = Array.isArray(body.data) ? body.data : [];

  return events.map<FacebookPageEvent>((e) => ({
    id: e.id,
    name: e.name?.trim() || 'Untitled event',
    description: e.description?.trim() || null,
    startTime: e.start_time ?? null,
    endTime: e.end_time ?? null,
    location: flattenPlace(e.place),
    coverImageUrl: e.cover?.source ?? null,
    // Facebook event permalink is deterministic — saves us a second API call.
    permalinkUrl: `https://www.facebook.com/events/${e.id}`,
  }));
}

/**
 * List of (pageId, publication) tuples to scan. Resolved at call-time from
 * the featured_social_posts table so admins don't have to redeploy when
 * adding/removing a Page from the rotation.
 *
 * Why not hard-code the IDs? They're stored alongside each curated post
 * already, and pulling them dynamically means a brand-new Page (e.g. if
 * Caxton launches a third publication) starts being scanned the moment
 * an admin curates a single post from it.
 */
export interface ScannablePage {
  pageId: string;
  pub: 'realtyline' | 'newsline' | 'both';
}

/**
 * Configured Pages whose feeds we scan automatically (no /admin/social
 * curation required). Format: `FB_PAGE_IDS="<pageId>:<pub>,<pageId>:<pub>"`
 * where pub is `realtyline`, `newsline`, or `both`.
 *
 * Example:
 *   FB_PAGE_IDS="123456789:realtyline,987654321:newsline"
 *
 * If unset, the Page-feed cron exits cleanly with skipped='no-pages-configured'.
 * (The Graph-events cron continues to use `featured_social_posts.page_id`
 * as its source — that path is curated-by-admin and stays user-driven.)
 */
export function listConfiguredPages(): ScannablePage[] {
  const raw = process.env.FB_PAGE_IDS?.trim();
  if (!raw) return [];
  const out: ScannablePage[] = [];
  for (const chunk of raw.split(',')) {
    const [pageId, pubRaw] = chunk.trim().split(':').map((s) => s?.trim());
    if (!pageId) continue;
    const pub: ScannablePage['pub'] =
      pubRaw === 'newsline' || pubRaw === 'both' ? pubRaw : 'realtyline';
    out.push({ pageId, pub });
  }
  return out;
}

export interface FacebookPagePost {
  /** Canonical {pageId}_{postId} */
  fbPostId: string;
  message: string | null;
  imageUrl: string | null;
  permalinkUrl: string;
  /** ISO timestamp */
  postedAt: string | null;
}

/**
 * Fetch recent posts from a Page's feed via Graph API. Used by the Page-feed
 * cron to detect events without requiring admin curation in /admin/social.
 *
 * since= cutoff defaults to 14 days back — enough to catch event flyers that
 * are typically posted 1–2 weeks before the event, but short enough that we
 * don't burn Gemini quota re-scanning ancient posts.
 */
export async function fetchPagePosts(
  pageId: string,
  opts: {
    token?: string;
    graphVersion?: string;
    lookbackDays?: number;
    limit?: number;
  } = {},
): Promise<FacebookPagePost[]> {
  const token = opts.token ?? process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new FacebookConfigError(
      'FB_PAGE_ACCESS_TOKEN is not set. See docs/FACEBOOK_SETUP.md for setup.',
    );
  }
  const version = opts.graphVersion ?? process.env.FB_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;
  const lookbackDays = opts.lookbackDays ?? 14;
  const limit = Math.min(opts.limit ?? 25, 100);

  const sinceUnix = Math.floor(Date.now() / 1000) - lookbackDays * 86_400;

  const fields = [
    'id',
    'message',
    'permalink_url',
    'full_picture',
    'created_time',
  ].join(',');

  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}/posts` +
    `?fields=${encodeURIComponent(fields)}` +
    `&since=${sinceUnix}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    let detail = '';
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j.error?.message ?? '';
    } catch {
      detail = await res.text();
    }
    throw new FacebookFetchError(
      `Graph API ${res.status}: ${detail || 'unknown error'} (Page ${pageId} /posts)`,
      res.status,
    );
  }

  interface PostRaw {
    id: string;
    message?: string;
    permalink_url?: string;
    full_picture?: string;
    created_time?: string;
  }
  const body = (await res.json()) as { data: PostRaw[] };
  const posts = Array.isArray(body.data) ? body.data : [];

  return posts.map<FacebookPagePost>((p) => {
    // Normalize id to compound form so we have pageId baked in.
    const id = p.id.includes('_') ? p.id : `${pageId}_${p.id}`;
    return {
      fbPostId: id,
      message: p.message?.trim() || null,
      imageUrl: p.full_picture ?? null,
      permalinkUrl: p.permalink_url ?? `https://facebook.com/${id}`,
      postedAt: p.created_time ?? null,
    };
  });
}
