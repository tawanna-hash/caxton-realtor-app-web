/**
 * Facebook Graph API helpers for the curated /admin/social tool.
 *
 * We only need read access to posts on Pages we own (RealtyLine Austin &
 * Newsline San Antonio). A single long-lived Page Access Token covers both —
 * see docs/FACEBOOK_SETUP.md for the one-time token generation walkthrough.
 *
 * Env vars:
 *   FB_PAGE_ACCESS_TOKEN  — long-lived token with pages_read_engagement
 *                          (single token can read multiple Pages if it's a
 *                          User token for a user who admins all the Pages).
 *   FB_GRAPH_VERSION      — optional, defaults to 'v20.0'.
 */

const DEFAULT_GRAPH_VERSION = 'v20.0';

export class FacebookConfigError extends Error {}
export class FacebookFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface FacebookPostMetadata {
  fbPostId: string;           // canonical {pageId}_{postId}
  pageId: string;
  permalinkUrl: string;
  message: string | null;
  imageUrl: string | null;
  postedAt: string | null;    // ISO timestamp
}

/**
 * Parse a Facebook post URL and return the canonical Graph API ID
 * ({pageId}_{postId}). Handles common URL shapes:
 *
 *   https://www.facebook.com/{PageName|pageId}/posts/{postId}
 *   https://www.facebook.com/{PageName|pageId}/posts/{slug}/{postId}
 *   https://www.facebook.com/permalink.php?story_fbid={postId}&id={pageId}
 *   https://www.facebook.com/{PageName}/photos/{albumId}/{photoId}
 *   https://www.facebook.com/{PageName}/videos/{videoId}
 *   https://www.facebook.com/story.php?story_fbid={postId}&id={pageId}
 *   https://fb.watch/{shortid}/        (NOT supported — short links don't expose ID)
 *
 * Returns either the canonical `{pageId}_{postId}` form (preferred) or just
 * a numeric postId if pageId can't be derived from the URL (Graph API will
 * still resolve it as long as the token has access).
 *
 * Throws if the URL doesn't look like a parseable Facebook post URL.
 */
export type FacebookUrlKind = 'page' | 'group';

export interface FacebookUrlParseResult {
  /** Best-effort canonical id we'll store in featured_social_posts.fb_post_id */
  fbPostId: string;
  /** Page slug / numeric page id, or group numeric id */
  pageHint?: string;
  /** Where the post lives. Page posts are auto-fetched via Graph API;
   *  group posts must be manually entered (Groups API was deprecated 2024). */
  kind: FacebookUrlKind;
}

export function parseFacebookPostUrl(input: string): FacebookUrlParseResult {
  const raw = input.trim();
  if (!raw) throw new Error('Empty URL');

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('Not a valid URL');
  }

  if (!/(^|\.)facebook\.com$/i.test(u.hostname) && !/(^|\.)fb\.com$/i.test(u.hostname)) {
    throw new Error('Not a facebook.com URL');
  }

  const segments = u.pathname.split('/').filter(Boolean);

  // ─── Group URLs ──────────────────────────────────────────────────────
  // facebook.com/groups/{groupId}                           (group home)
  // facebook.com/groups/{groupId}/posts/{postId}            (canonical post)
  // facebook.com/groups/{groupId}/permalink/{postId}        (legacy permalink)
  // facebook.com/groups/{groupId}/posts/{postId}/?...       (with query)
  if (segments[0] === 'groups' && segments[1]) {
    const groupId = segments[1];
    const kind: FacebookUrlKind = 'group';

    // /groups/{id}/posts/{postId}  or  /groups/{id}/permalink/{postId}
    if ((segments[2] === 'posts' || segments[2] === 'permalink') && segments[3]) {
      const postId = segments[3];
      if (/^\d{6,}$/.test(postId)) {
        return { fbPostId: `${groupId}_${postId}`, pageHint: groupId, kind };
      }
    }

    // /groups/{id} on its own → not a single post, but admin chose group
    // mode intentionally. We synthesize a stable id from the URL + ts so
    // upsert idempotency still works while letting the admin curate manually.
    throw new Error(
      'Group home URL detected. To curate a specific post, open it on ' +
        'facebook.com and copy the post URL (groups/{id}/posts/{postId}/).'
    );
  }

  // ─── Page URLs ───────────────────────────────────────────────────────
  // ?story_fbid + ?id  (permalink.php / story.php style)
  const storyFbid = u.searchParams.get('story_fbid');
  const idParam = u.searchParams.get('id');
  if (storyFbid && idParam) {
    return { fbPostId: `${idParam}_${storyFbid}`, pageHint: idParam, kind: 'page' };
  }
  if (storyFbid) {
    return { fbPostId: storyFbid, kind: 'page' };
  }

  // Path-based: /{Page}/posts/{id} or /{Page}/posts/{slug}/{id}
  if (segments.length >= 3) {
    const [pageSeg, kind, ...rest] = segments;
    if (['posts', 'photos', 'videos'].includes(kind)) {
      // Take the LAST numeric segment as the post/photo/video ID.
      const numeric = rest.reverse().find((s) => /^\d{6,}$/.test(s));
      if (numeric) {
        if (/^\d+$/.test(pageSeg)) {
          return {
            fbPostId: `${pageSeg}_${numeric}`,
            pageHint: pageSeg,
            kind: 'page',
          };
        }
        return { fbPostId: numeric, pageHint: pageSeg, kind: 'page' };
      }
    }
  }

  // /share/p/{shortcode}/   (newer share links — not resolvable without API call)
  if (segments[0] === 'share') {
    throw new Error(
      "Facebook share-link URLs (/share/p/...) don't expose the post ID. " +
        'Open the post on facebook.com and copy the URL from the address bar.'
    );
  }

  throw new Error(
    'Could not extract a post ID from this URL. ' +
      'Paste the URL of a Facebook post directly (https://facebook.com/{page}/posts/{id}).'
  );
}

/**
 * Fetch post metadata from the Graph API. Token must have access to the Page
 * the post belongs to (i.e. it's a Page Access Token for one of our Pages, or
 * a User token for the admin user).
 */
export async function fetchFacebookPostMetadata(
  fbPostId: string,
  opts: { token?: string; graphVersion?: string } = {}
): Promise<FacebookPostMetadata> {
  const token = opts.token ?? process.env.FB_PAGE_ACCESS_TOKEN;
  if (!token) {
    throw new FacebookConfigError(
      'FB_PAGE_ACCESS_TOKEN is not set. See docs/FACEBOOK_SETUP.md for setup.'
    );
  }
  const version = opts.graphVersion ?? process.env.FB_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION;

  const fields = [
    'id',
    'message',
    'permalink_url',
    'full_picture',
    'created_time',
    'from{id,name}',
  ].join(',');

  const url =
    `https://graph.facebook.com/${version}/${encodeURIComponent(fbPostId)}` +
    `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

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
      `Graph API ${res.status}: ${detail || 'unknown error'}`,
      res.status
    );
  }

  const data = (await res.json()) as {
    id: string;
    message?: string;
    permalink_url?: string;
    full_picture?: string;
    created_time?: string;
    from?: { id: string; name: string };
  };

  // Normalize id to compound form when we have a from.id and the id is just numeric.
  let canonicalId = data.id;
  const pageId = data.from?.id ?? '';
  if (pageId && !canonicalId.includes('_')) {
    canonicalId = `${pageId}_${canonicalId}`;
  }

  return {
    fbPostId: canonicalId,
    pageId,
    permalinkUrl: data.permalink_url ?? `https://facebook.com/${canonicalId}`,
    message: data.message ?? null,
    imageUrl: data.full_picture ?? null,
    postedAt: data.created_time ?? null,
  };
}
