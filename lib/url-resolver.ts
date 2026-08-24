// lib/url-resolver.ts
//
// Server-side URL resolver. Follows HTTP redirects to find the final
// destination of a shortened URL (bit.ly, tinyurl, t.co, etc.) so we
// can store the real destination in hotspot configs and bypass the
// shortener's interstitial at click time.
//
// Used by:
//   - POST /api/admin/resolve-url (manual resolve from the editor)
//   - POST /api/admin/magazines/:id/extract-all (auto-resolve at import)
//
// SSRF protection: rejects private IPv4 ranges and localhost.

const KNOWN_SHORTENERS: ReadonlySet<string> = new Set([
  'bit.ly', 'bitly.com', 'j.mp',
  'tinyurl.com', 'tiny.cc',
  't.co',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'lnkd.in',
  'is.gd', 'v.gd',
  'shorturl.at',
  'rebrand.ly',
  'short.io',
  'cutt.ly',
  'qrco.de',
  's.id',
]);

export function isShortenerUrl(input: string): boolean {
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return KNOWN_SHORTENERS.has(host);
  } catch {
    return false;
  }
}

function isPrivateOrLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

export interface ResolveResult {
  resolved: string;
  hops: string[];
  final_status: number;
}

export async function resolveUrl(
  input: string,
  opts: { maxHops?: number; timeoutMs?: number } = {},
): Promise<ResolveResult> {
  const maxHops = opts.maxHops ?? 8;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const hops: string[] = [];
  let current = input.trim();
  if (!current) throw new Error('empty URL');

  for (let i = 0; i < maxHops; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      throw new Error(`invalid URL: ${current.slice(0, 200)}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`);
    }
    if (isPrivateOrLocalHost(parsed.hostname)) {
      throw new Error(`blocked private/local host: ${parsed.hostname}`);
    }

    hops.push(current);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) {
        return { resolved: current, hops, final_status: res.status };
      }
      try {
        current = new URL(loc, current).toString();
      } catch {
        throw new Error(`invalid redirect Location: ${loc.slice(0, 200)}`);
      }
      continue;
    }

    return { resolved: current, hops, final_status: res.status };
  }

  throw new Error(`too many redirects (>${maxHops})`);
}
