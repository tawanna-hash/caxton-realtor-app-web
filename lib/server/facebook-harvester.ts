/**
 * Facebook public-page harvester.
 *
 * For Group posts (which the Graph API can't read since Meta deprecated the
 * Groups API in 2024), this fetches the public HTML of the post URL and
 * extracts the caption + image + posted-at from OpenGraph / JSON-LD tags.
 *
 * This is best-effort:
 *   • Works when Facebook serves the post HTML to a non-logged-in browser
 *     (most truly public group posts).
 *   • Fails when Facebook returns a login redirect, an empty shell, or a
 *     consent interstitial (private groups, region-gated content, FB's
 *     anti-bot rate-limiting kicking in).
 *
 * On failure we return { harvested: false, reason } so the UI can fall
 * back to the existing manual-entry path (admin pastes caption / uploads
 * thumbnail themselves).
 *
 * NOTE: this only collects publicly-available metadata that Facebook
 * already exposes in OpenGraph tags to every link-preview crawler (Slack,
 * Twitter, Discord, etc.) — we're not bypassing any access controls.
 */

export interface HarvestResult {
  harvested: boolean;
  message: string | null;
  imageUrl: string | null;
  postedAt: string | null; // ISO timestamp
  reason?: string; // populated when harvested === false
}

// Facebook serves a much richer HTML shell to real-browser User-Agents than
// it does to obvious bot UAs. Use a modern Chrome UA string.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FETCH_TIMEOUT_MS = 8_000;

/**
 * Strip HTML entities most commonly found in og:description / og:title.
 * We're not trying to be a full HTML decoder — just the handful FB emits.
 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

/**
 * Pull the content="…" of <meta property|name="<key>" content="…">.
 * Tolerates attribute reordering and either single or double quotes.
 */
function pickMeta(html: string, key: string): string | null {
  // property="og:image" content="…"
  const reA = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i'
  );
  const mA = reA.exec(html);
  if (mA) return decodeEntities(mA[1]);

  // content="…" property="og:image"   (attributes reversed)
  const reB = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    'i'
  );
  const mB = reB.exec(html);
  if (mB) return decodeEntities(mB[1]);

  return null;
}

/**
 * Pull the first JSON-LD <script type="application/ld+json"> block and try
 * to find a SocialMediaPosting-shaped object with datePublished / articleBody.
 */
function pickJsonLd(html: string): {
  message?: string;
  postedAt?: string;
  imageUrl?: string;
} {
  const out: { message?: string; postedAt?: string; imageUrl?: string } = {};
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const m of blocks) {
    try {
      const raw = m[1].trim();
      if (!raw) continue;
      const data = JSON.parse(raw) as unknown;
      // Handle either a single object or an array of objects.
      const candidates = Array.isArray(data) ? data : [data];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const c = candidate as Record<string, unknown>;
        if (typeof c.datePublished === 'string' && !out.postedAt) {
          out.postedAt = c.datePublished;
        }
        if (typeof c.articleBody === 'string' && !out.message) {
          out.message = c.articleBody;
        }
        if (typeof c.description === 'string' && !out.message) {
          out.message = c.description;
        }
        if (typeof c.image === 'string' && !out.imageUrl) {
          out.imageUrl = c.image;
        } else if (
          c.image &&
          typeof c.image === 'object' &&
          !Array.isArray(c.image) &&
          typeof (c.image as Record<string, unknown>).url === 'string' &&
          !out.imageUrl
        ) {
          out.imageUrl = (c.image as Record<string, string>).url;
        }
      }
    } catch {
      // Not parseable JSON — skip this block.
    }
  }
  return out;
}

/**
 * Heuristic check: did Facebook send us a real post page, or a login wall?
 *
 * The login-wall HTML doesn't include og:url pointing to /groups/, and
 * usually contains the string "You must log in to continue" or a
 * <meta property="og:title" content="Facebook">.
 */
function looksLikeLoginWall(html: string): boolean {
  if (/You must log in to continue/i.test(html)) return true;
  const ogTitle = pickMeta(html, 'og:title');
  if (ogTitle && ogTitle.trim().toLowerCase() === 'facebook') return true;
  return false;
}

/**
 * Fetch a Facebook URL and extract caption / image / posted-at from OG tags.
 *
 * Always resolves (never throws on network errors) — caller checks
 * `.harvested` to decide whether to fall back to manual entry.
 */
export async function harvestFacebookPostHtml(
  url: string
): Promise<HarvestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        harvested: false,
        message: null,
        imageUrl: null,
        postedAt: null,
        reason: `Facebook returned HTTP ${res.status}. Try entering the caption + image manually.`,
      };
    }
    html = await res.text();
  } catch (err) {
    return {
      harvested: false,
      message: null,
      imageUrl: null,
      postedAt: null,
      reason:
        err instanceof Error && err.name === 'AbortError'
          ? 'Facebook took too long to respond. Try entering the caption + image manually.'
          : `Couldn't reach Facebook (${err instanceof Error ? err.message : 'network error'}). Try entering the caption + image manually.`,
    };
  } finally {
    clearTimeout(timeout);
  }

  if (looksLikeLoginWall(html)) {
    return {
      harvested: false,
      message: null,
      imageUrl: null,
      postedAt: null,
      reason:
        'Facebook served a login wall for this URL — the group post may be private or region-gated. Enter the caption + image manually.',
    };
  }

  const ogImage = pickMeta(html, 'og:image');
  const ogDesc = pickMeta(html, 'og:description');
  const ogTitle = pickMeta(html, 'og:title');
  const publishedTime =
    pickMeta(html, 'article:published_time') ??
    pickMeta(html, 'og:updated_time');

  const jsonLd = pickJsonLd(html);

  // Caption: prefer JSON-LD articleBody (full text), fall back to og:description
  // (often truncated), then og:title.
  let message: string | null =
    jsonLd.message ?? ogDesc ?? (ogTitle && ogTitle !== 'Facebook' ? ogTitle : null);
  if (message) message = message.trim() || null;

  // Image: prefer og:image (FB's link-preview thumbnail).
  const imageUrl = ogImage ?? jsonLd.imageUrl ?? null;

  // Posted-at: JSON-LD datePublished is most reliable; fall back to
  // article:published_time meta tag.
  const postedAt = jsonLd.postedAt ?? publishedTime ?? null;

  const gotSomething = Boolean(message || imageUrl);
  if (!gotSomething) {
    return {
      harvested: false,
      message: null,
      imageUrl: null,
      postedAt: null,
      reason:
        "Couldn't find caption or image in this page's HTML. The post may require login. Enter manually.",
    };
  }

  return {
    harvested: true,
    message,
    imageUrl,
    postedAt,
  };
}
