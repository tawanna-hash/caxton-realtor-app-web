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
