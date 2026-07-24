// lib/scrapers/newmark-homes.ts
//
// Newmark Homes — Austin communities + move-in-ready home scraper.
//
// newmarkhomes.com is a jQuery site whose community + home cards are
// server-rendered in the listing-page HTML (no JS shell, no JSON API), so we
// fetch the two pages and parse with cheerio.
//
// Communities: https://newmarkhomes.com/new-homes/austin/communities
//   -> one row per community (kind='listing', homeType='community').
// Move-in ready: https://newmarkhomes.com/new-homes/austin
//   -> one row per available home (kind='listing', homeType='showcase').
//
// Market: Austin -> publication 'realtyline'. (Newmark also builds in Houston,
// but Houston isn't launched yet, so we scope to the Austin market pages only.)
//
// Each home card exposes stable data-home ids (e.g. "1687"), used as the
// external_id so sold homes prune cleanly via deactivateStaleBuilderInventory.
// Community rows are keyed on the /communities/{slug} href.

import * as cheerio from 'cheerio';

const BASE_URL = 'https://newmarkhomes.com';
export const NEWMARK_COMMUNITIES_URL = `${BASE_URL}/new-homes/austin/communities`;
export const NEWMARK_MOVE_IN_READY_URL = `${BASE_URL}/new-homes/austin`;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/124.0.0.0 Safari/537.36';

export const NEWMARK_BUILDER_NAME = 'Newmark Homes';
export const NEWMARK_PUBLICATION = 'realtyline' as const;

// ─────────────────────────────────────────────────────────────────────────
// Output row shapes
// ─────────────────────────────────────────────────────────────────────────

export type NewmarkCommunityRow = {
  externalId: string;
  builderName: typeof NEWMARK_BUILDER_NAME;
  title: string;
  city: string;
  state: string;
  address: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  priceRangeText: string | null;
  tagline: string | null;
  phone: string | null;
  availableHomes: number | null;
  availablePlans: number | null;
};

export type NewmarkHomeRow = {
  externalId: string;
  builderName: typeof NEWMARK_BUILDER_NAME;
  title: string;
  city: string;
  state: string;
  address: string | null;
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  communityName: string | null;
  planName: string | null;
};

export type NewmarkScrapeResult<T> = { rows: T[]; rawCount: number };

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function num(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

// "san-marcos" -> "San Marcos", "georgetown" -> "Georgetown".
function formatCity(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const out = slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return out || null;
}

function absUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('/')) return BASE_URL + path;
  return null;
}

// Extract the src= param from a phpThumb URL like
//   /phpThumb/phpThumb.php?zc=1&w=780&h=504&src=/uploads/images/homes/1687/front-48.jpg
function imageFromDataImage(dataImage: string | null | undefined): string | null {
  if (!dataImage) return null;
  const m = dataImage.match(/[?&]src=([^&]+)/);
  if (!m) return absUrl(dataImage);
  return absUrl(decodeURIComponent(m[1]));
}

async function fetchHtml(url: string, label: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Newmark ${label} fetch failed: ${msg}`);
  }
  if (!res.ok) {
    throw new Error(`Newmark ${label} returned HTTP ${res.status}`);
  }
  return res.text();
}

// ─────────────────────────────────────────────────────────────────────────
// Communities
// ─────────────────────────────────────────────────────────────────────────

export async function fetchNewmarkCommunities(): Promise<
  NewmarkScrapeResult<NewmarkCommunityRow>
> {
  const html = await fetchHtml(NEWMARK_COMMUNITIES_URL, 'communities');
  const $ = cheerio.load(html);

  const rows: NewmarkCommunityRow[] = [];

  $('.communitiesPage .items .item').each((_, el) => {
    const $i = $(el);

    const slugHref = $i.find('.photo a[href^="/communities/"]').attr('href') || '';
    const slug = slugHref.replace('/communities/', '').trim();
    if (!slug) return;

    const name = $i.find('h4').first().text().trim() || slug;
    const priceRangeText = $i.find('.pricepoint').text().trim() || null;

    // Visit link is /new-homes/austin/{city}/{slug} -> city is segment [2].
    const visitHref = $i.find('.visit a').attr('href') || '';
    const visitParts = visitHref.split('/').filter(Boolean);

    // Location cell: street on line 1, "City, ST zip" on line 2, phone in a div.
    const $loc = $i.find('.location').clone();
    $loc.find('div').remove(); // drop the phone <div>
    const locText = $loc
      .html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim() ?? '';
    const locLines = locText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const cszRe = /,\s*([A-Z]{2})\s*(\d{5})?\b/;
    // City/state/zip live on the line that matches "..., ST #####".
    const cszLine = locLines.find((l) => cszRe.test(l)) || '';
    const cityFromLoc = cszLine.split(',')[0]?.trim() || null;
    const city = cityFromLoc || formatCity(visitParts[2]) || 'Austin';
    // Street = first line that isn't a city/state/zip line.
    const address =
      locLines.find((l) => !cszRe.test(l) && l.length > 0) || null;
    const state = (cszLine.match(cszRe)?.[1] || 'TX').toUpperCase();
    const phoneMatch = $i
      .find('.location div')
      .first()
      .text()
      .match(/\(?\d{3}\)?[-.\s]?\d{3}[-.]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : null;
    const tagline = $i.find('.tagline').text().trim() || null;
    const bolds = $i
      .find('.bold')
      .map((__, b) => $(b).text().trim())
      .get();
    const availableHomes = num(bolds[0]);
    const availablePlans = num(bolds[1]);

    const bg = ($i.find('.photo').attr('style') || '').match(
      /url\(['"]?([^'")]+)['"]?\)/,
    );
    const thumbnailUrl = bg ? absUrl(bg[1]) : null;

    const description = [
      tagline,
      priceRangeText,
      availableHomes != null ? `${availableHomes} available homes` : null,
      availablePlans != null ? `${availablePlans} floor plans` : null,
      phone ? `Sales office: ${phone}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    rows.push({
      externalId: `newmark-community/${slug}`,
      builderName: NEWMARK_BUILDER_NAME,
      title: name,
      city: city ?? 'Austin',
      state,
      address,
      description: description || null,
      thumbnailUrl,
      sourceUrl: absUrl(slugHref),
      priceRangeText,
      tagline,
      phone,
      availableHomes,
      availablePlans,
    });
  });

  return { rows, rawCount: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Move-in ready homes
// ─────────────────────────────────────────────────────────────────────────

export async function fetchNewmarkMoveInReady(): Promise<
  NewmarkScrapeResult<NewmarkHomeRow>
> {
  const html = await fetchHtml(NEWMARK_MOVE_IN_READY_URL, 'move-in-ready');
  const $ = cheerio.load(html);

  const rows: NewmarkHomeRow[] = [];

  $('.itemContainer[data-home]').each((_, el) => {
    const $i = $(el);
    const dataHome = ($i.attr('data-home') || '').trim();
    if (!dataHome) return;

    const communityName =
      $i.find('.sort-community').first().text().trim() || null;

    // Visible (non-hidden) community span often appends a plan/series name,
    // e.g. sort-community="Easton Park", visible="Easton Park Quad 45".
    const visibleCommunitySpan = $i
      .find('.community span')
      .filter((__, s) => !($(s).attr('style') || '').includes('display:none'))
      .first()
      .text()
      .trim();
    const planName =
      visibleCommunitySpan && communityName
        ? visibleCommunitySpan
            .replace(communityName, '')
            .replace(/^[\s\-–:]+|[\s\-–:]+$/g, '')
            .trim() || null
        : null;

    const address = $i.find('.sort-address1').text().trim() || null;
    const line2 = $i.find('.line2').text().trim();
    const city = line2.split(',')[0]?.trim() || null;
    const state = (line2.match(/,\s*([A-Z]{2})\s/)?.[1] || 'TX').toUpperCase();

    const price = num($i.find('.sort-price').text());
    const sqft = num($i.find('.sort-square_feet').text());
    const beds = num($i.find('.sort-beds').text());
    const baths = num($i.find('.sort-baths').text());

    const ribbon = $i.find('.ribbon-front').first().text().trim() || null;

    const thumbnailUrl = imageFromDataImage(
      $i.find('.photoContainer').attr('data-image'),
    );

    const href =
      $i.find('.ratio a').attr('href') ||
      $i.find('.button a').attr('href') ||
      '';
    const sourceUrl = href ? absUrl(href) : null;

    const title = [address, city].filter(Boolean).join(', ');

    rows.push({
      externalId: `newmark-home/${dataHome}`,
      builderName: NEWMARK_BUILDER_NAME,
      title: title || `Newmark home ${dataHome}`,
      city: city || 'Austin',
      state,
      address,
      description: ribbon,
      bedsMin: beds,
      bedsMax: beds,
      bathsMin: baths,
      bathsMax: baths,
      sqftMin: sqft,
      sqftMax: sqft,
      priceMin: price,
      priceMax: price,
      thumbnailUrl,
      sourceUrl,
      communityName,
      planName,
    });
  });

  return { rows, rawCount: rows.length };
}
