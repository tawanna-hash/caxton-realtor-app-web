// lib/scrapers/newmark-homes.ts
//
// Newmark Homes — Austin communities + move-in-ready home scraper.
//
// newmarkhomes.com is a jQuery site whose community + home cards are
// server-rendered in the listing-page HTML (no JS shell, no JSON API), so we
// fetch the pages and parse with cheerio.
//
// Communities: https://newmarkhomes.com/new-homes/austin/communities
//   -> one row per community (kind='listing', homeType='community').
//   -> then fetches each community's detail page (/new-homes/austin/{city}/{slug})
//      to pull home plans (beds/baths/sqft/price/image/url), amenities, and a
//      photo gallery, mirroring the David Weekley / M/I community pages.
// Move-in ready: https://newmarkhomes.com/new-homes/austin
//   -> one row per available home (kind='listing', homeType='showcase').
//   -> then fetches each home's detail page for a photo gallery + description
//      so the in-app detail page isn't just a single thumbnail + ribbon.
//
// Market: Austin -> publication 'realtyline'. (Newmark also builds in Houston,
// but Houston isn't launched yet, so we scope to the Austin market pages only.)
//
// Each home card exposes stable data-home ids (e.g. "1687"), used as the
// external_id so sold homes prune cleanly via deactivateStaleBuilderInventory.
// Community rows are keyed on the /communities/{slug} href.

import * as cheerio from 'cheerio';
import type { CommunityData } from './david-weekley';

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
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
  galleryUrls: string[] | null;
  communityData: CommunityData | null;
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
  galleryUrls: string[] | null;
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

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, ' ')
    .trim();
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

async function fetchHtml(url: string, label: string, timeoutMs = 20_000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
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

// Run an async mapper over items with a small concurrency cap so we don't open
// 24 simultaneous connections to newmarkhomes.com. Errors per item are caught
// and returned as null so one bad page doesn't abort the whole scrape.
async function pMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 4,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function minMax(values: (number | null)[]): { min: number | null; max: number | null } {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return { min: null, max: null };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

// Collect gallery image URLs from .fancybox.thumb-gallery elements. Prefers
// data-fancybox-href (the large version), falls back to data-image.
function collectGallery($: cheerio.CheerioAPI): string[] {
  const out = new Set<string>();
  $('a.fancybox, .fancybox.thumb-gallery').each((_, el) => {
    const $e = $(el);
    const raw = $e.attr('data-fancybox-href') || $e.attr('data-image') || $e.attr('href');
    const url = imageFromDataImage(raw);
    if (url) out.add(url);
  });
  return [...out];
}

// ─────────────────────────────────────────────────────────────────────────
// Community detail page -> plans / amenities / gallery / description
// ─────────────────────────────────────────────────────────────────────────

type CommunityDetail = {
  plans: NonNullable<CommunityData['homePlans']>;
  amenities: string[];
  imageUrls: string[];
  description: string | null;
  bedsMin: number | null;
  bedsMax: number | null;
  bathsMin: number | null;
  bathsMax: number | null;
  sqftMin: number | null;
  sqftMax: number | null;
  priceMin: number | null;
  priceMax: number | null;
};

async function fetchCommunityDetail(
  visitUrl: string,
): Promise<CommunityDetail | null> {
  let html: string;
  try {
    html = await fetchHtml(visitUrl, `community detail ${visitUrl}`, 20_000);
  } catch {
    return null;
  }
  const $ = cheerio.load(html);

  const plans: NonNullable<CommunityData['homePlans']> = [];
  const beds: number[] = [];
  const baths: number[] = [];
  const sqft: number[] = [];
  const price: number[] = [];

  $('.itemContainer[data-home]').each((_, el) => {
    const $i = $(el);
    const dataHome = ($i.attr('data-home') || '').trim();
    if (!dataHome) return;

    // Visible (non-hidden) community span often appends a plan/series name,
    // e.g. sort-community="Anthem", visible="Anthem 50" -> plan name "Anthem 50".
    const visibleSpan = $i
      .find('.community span')
      .filter((__, s) => !($(s).attr('style') || '').includes('display:none'))
      .first()
      .text()
      .trim();
    const planName = visibleSpan || null;

    const b = num($i.find('.sort-beds').text());
    const ba = num($i.find('.sort-baths').text());
    const sq = num($i.find('.sort-square_feet').text());
    const pr = num($i.find('.sort-price').text());
    if (b != null) beds.push(b);
    if (ba != null) baths.push(ba);
    if (sq != null) sqft.push(sq);
    if (pr != null) price.push(pr);

    const priceDisplay = $i.find('.price').first().text().trim() || null;
    const imageUrl = imageFromDataImage($i.find('.photoContainer').attr('data-image'));
    const href = $i.find('.ratio a').attr('href') || $i.find('.button a').attr('href') || '';
    const url = href ? absUrl(href) : null;

    plans.push({
      name: planName || `Plan ${dataHome}`,
      beds: b != null ? String(b) : null,
      baths: ba != null ? String(ba) : null,
      sqftDisplay: sq != null ? sq.toLocaleString('en-US') : null,
      priceDisplay,
      imageUrl,
      url,
    });
  });

  const amenities: string[] = [];
  $('.amenities-wrapper li').each((_, el) => {
    const t = stripTags($(el).html() || '');
    if (t) amenities.push(t);
  });

  const imageUrls = collectGallery($);

  // Community intro paragraph (the "Discover {Name}" / area-detail copy).
  let description: string | null = null;
  const areaDetail = $('.area-detail, .communitydetail, .field-name-body')
    .first()
    .find('p')
    .map((_, p) => stripTags($(p).html() || ''))
    .get()
    .filter(Boolean)
    .join(' ');
  if (areaDetail) description = areaDetail.slice(0, 600);

  const bb = minMax(beds);
  const bab = minMax(baths);
  const sqb = minMax(sqft);
  const prb = minMax(price);

  return {
    plans,
    amenities,
    imageUrls,
    description,
    bedsMin: bb.min,
    bedsMax: bb.max,
    bathsMin: bab.min,
    bathsMax: bab.max,
    sqftMin: sqb.min,
    sqftMax: sqb.max,
    priceMin: prb.min,
    priceMax: prb.max,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Communities
// ─────────────────────────────────────────────────────────────────────────

export async function fetchNewmarkCommunities(): Promise<
  NewmarkScrapeResult<NewmarkCommunityRow>
> {
  const html = await fetchHtml(NEWMARK_COMMUNITIES_URL, 'communities');
  const $ = cheerio.load(html);

  type Card = {
    slug: string;
    slugHref: string;
    name: string;
    priceRangeText: string | null;
    visitHref: string;
    city: string;
    state: string;
    address: string | null;
    phone: string | null;
    tagline: string | null;
    availableHomes: number | null;
    availablePlans: number | null;
    thumbnailUrl: string | null;
  };

  const cards: Card[] = [];

  $('.communitiesPage .items .item').each((_, el) => {
    const $i = $(el);

    const slugHref = $i.find('.photo a[href^="/communities/"]').attr('href') || '';
    const slug = slugHref.replace('/communities/', '').split('#')[0].trim();
    if (!slug) return;

    const name = $i.find('h4').first().text().trim() || slug;
    const priceRangeText = $i.find('.pricepoint').text().trim() || null;

    const visitHref = $i.find('.visit a').attr('href') || '';
    const visitParts = visitHref.split('/').filter(Boolean);

    const $loc = $i.find('.location').clone();
    $loc.find('div').remove();
    const locText = $loc
      .html()
      ?.replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim() ?? '';
    const locLines = locText.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    const cszRe = /,\s*([A-Z]{2})\s*(\d{5})?\b/;
    const cszLine = locLines.find((l) => cszRe.test(l)) || '';
    const cityFromLoc = cszLine.split(',')[0]?.trim() || null;
    const city = cityFromLoc || formatCity(visitParts[2]) || 'Austin';
    const address = locLines.find((l) => !cszRe.test(l) && l.length > 0) || null;
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

    cards.push({
      slug,
      slugHref,
      name,
      priceRangeText,
      visitHref,
      city,
      state,
      address,
      phone,
      tagline,
      availableHomes,
      availablePlans,
      thumbnailUrl,
    });
  });

  // Fetch each community's detail page in parallel (small concurrency).
  const details = await pMap(
    cards,
    (c) => fetchCommunityDetail(absUrl(c.visitHref) || ''),
    3,
  );

  const rows: NewmarkCommunityRow[] = cards.map((c, i) => {
    const d = details[i];
    const galleryUrls = d && d.imageUrls.length > 0 ? d.imageUrls : null;

    const baseDesc = [
      d?.description,
      c.tagline,
      c.priceRangeText,
      c.availableHomes != null ? `${c.availableHomes} available homes` : null,
      c.availablePlans != null ? `${c.availablePlans} floor plans` : null,
      c.phone ? `Sales office: ${c.phone}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    const communityData: CommunityData | null = d
      ? {
          priceFrom: c.priceRangeText,
          sqftRange:
            d.sqftMin != null || d.sqftMax != null
              ? [d.sqftMin, d.sqftMax]
                  .filter((v) => v != null)
                  .map((v) => v!.toLocaleString('en-US'))
                  .join('-')
              : null,
          amenities: d.amenities.length > 0 ? d.amenities : [],
          homePlans: d.plans,
          imageUrls: d.imageUrls,
          salesOffice: c.address ? { address: c.address } : null,
          city: c.city,
        }
      : null;

    return {
      externalId: `newmark-community/${c.slug}`,
      builderName: NEWMARK_BUILDER_NAME,
      title: c.name,
      city: c.city,
      state: c.state,
      address: c.address,
      description: baseDesc || null,
      thumbnailUrl: c.thumbnailUrl,
      sourceUrl: absUrl(c.slugHref),
      bedsMin: d?.bedsMin ?? null,
      bedsMax: d?.bedsMax ?? null,
      bathsMin: d?.bathsMin ?? null,
      bathsMax: d?.bathsMax ?? null,
      sqftMin: d?.sqftMin ?? null,
      sqftMax: d?.sqftMax ?? null,
      priceMin: d?.priceMin ?? null,
      priceMax: d?.priceMax ?? null,
      galleryUrls,
      communityData,
    };
  });

  return { rows, rawCount: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Move-in ready homes
// ─────────────────────────────────────────────────────────────────────────

type HomeDetail = { galleryUrls: string[] | null; description: string | null };

async function fetchHomeDetail(sourceUrl: string): Promise<HomeDetail | null> {
  let html: string;
  try {
    html = await fetchHtml(sourceUrl, `home detail ${sourceUrl}`, 15_000);
  } catch {
    return null;
  }
  const $ = cheerio.load(html);
  const gallery = collectGallery($);
  const description =
    stripTags($('.description').first().html() || '') || null;
  if (gallery.length === 0 && !description) return null;
  return {
    galleryUrls: gallery.length > 0 ? gallery : null,
    description,
  };
}

export async function fetchNewmarkMoveInReady(): Promise<
  NewmarkScrapeResult<NewmarkHomeRow>
> {
  const html = await fetchHtml(NEWMARK_MOVE_IN_READY_URL, 'move-in-ready');
  const $ = cheerio.load(html);

  type Card = {
    dataHome: string;
    communityName: string | null;
    planName: string | null;
    address: string | null;
    city: string | null;
    state: string;
    price: number | null;
    sqft: number | null;
    beds: number | null;
    baths: number | null;
    ribbon: string | null;
    thumbnailUrl: string | null;
    sourceUrl: string | null;
  };

  const cards: Card[] = [];

  $('.itemContainer[data-home]').each((_, el) => {
    const $i = $(el);
    const dataHome = ($i.attr('data-home') || '').trim();
    if (!dataHome) return;

    const communityName = $i.find('.sort-community').first().text().trim() || null;
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

    cards.push({
      dataHome,
      communityName,
      planName,
      address,
      city,
      state,
      price,
      sqft,
      beds,
      baths,
      ribbon,
      thumbnailUrl,
      sourceUrl,
    });
  });

  // Fetch each home's detail page for gallery + description (small concurrency).
  const details = await pMap(
    cards,
    (c) => (c.sourceUrl ? fetchHomeDetail(c.sourceUrl) : Promise.resolve(null)),
    4,
  );

  const rows: NewmarkHomeRow[] = cards.map((c, i) => {
    const d = details[i];
    const title = [c.address, c.city].filter(Boolean).join(', ');
    const description = [c.ribbon, d?.description].filter(Boolean).join('. ') || null;
    return {
      externalId: `newmark-home/${c.dataHome}`,
      builderName: NEWMARK_BUILDER_NAME,
      title: title || `Newmark home ${c.dataHome}`,
      city: c.city || 'Austin',
      state: c.state,
      address: c.address,
      description,
      bedsMin: c.beds,
      bedsMax: c.beds,
      bathsMin: c.baths,
      bathsMax: c.baths,
      sqftMin: c.sqft,
      sqftMax: c.sqft,
      priceMin: c.price,
      priceMax: c.price,
      thumbnailUrl: c.thumbnailUrl,
      sourceUrl: c.sourceUrl,
      communityName: c.communityName,
      planName: c.planName,
      galleryUrls: d?.galleryUrls ?? null,
    };
  });

  return { rows, rawCount: rows.length };
}
