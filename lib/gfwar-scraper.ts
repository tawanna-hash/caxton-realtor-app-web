// Greater Fort Worth Association of REALTORS® (GFWAR) events importer for
// the Dallas/Ft. Worth calendar.
//
// Sources: the public Events list https://gfwar.org/events/annual-events/?class_yn=N
// and Classes list https://gfwar.org/events/classes/?class_yn=Y (WordPress). The list gives title, detail link, image and registration
// link; each detail page's right column gives the full date (with year),
// time range, location and price. Rows are upserted with publication =
// 'dallas', external_source = 'gfwar', external_id = detail-page slug, and
// titles prefixed "Greater Ft. Worth: ".

import type { EventInput } from './events-store';
import { centralIso, htmlToText } from './metrotex-scraper';

const LISTS = [
  { url: 'https://gfwar.org/events/annual-events/?class_yn=N', tag: 'event' },
  { url: 'https://gfwar.org/events/classes/?class_yn=Y', tag: 'class' },
] as const;
const SOURCE = 'gfwar' as const;
const PUBLICATION = 'dallas' as const;
const TITLE_PREFIX = 'Greater Ft. Worth: ';
const ORGANIZER = 'Greater Fort Worth Association of REALTORS®';
const UA = 'Mozilla/5.0 (compatible; RealtyNewsNow-Calendar/1.0; +https://realtynewsnow.app)';
const TIMEOUT_MS = 20_000;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

async function getHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`GFWAR HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function decode(s: string): string {
  return htmlToText(s).replace(/&#0?38;/g, '&').replace(/&#8211;/g, '–').replace(/&#8217;/g, '’').replace(/\s+/g, ' ').trim();
}

/** "9:00 am" -> "09:00:00" */
function to24(t: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(t.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === 'pm') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}:00`;
}

interface ListItem { slug: string; url: string; title: string; image: string | null; registration: string | null; tag: string }

function parseList(html: string, tag: string): ListItem[] {
  const out: ListItem[] = [];
  const seen = new Set<string>();
  for (const block of html.split("<table class='tblEventList'>").slice(1)) {
    const url = /href='(https:\/\/gfwar\.org\/event\/([^'/]+)\/?)'/.exec(block);
    const title = /<h4>([\s\S]*?)<\/h4>/.exec(block);
    if (!url || !title || seen.has(url[2])) continue;
    seen.add(url[2]);
    const img = /<img[^>]*src='([^']+)'/.exec(block);
    const reg = /<a href='([^']+)'[^>]*class='button-link'>\s*Registration\s*<\/a>/.exec(block);
    out.push({
      slug: url[2],
      url: url[1],
      title: decode(title[1]),
      image: img ? img[1] : null,
      registration: reg ? reg[1].replace(/&amp;|&#0?38;/g, '&') : null,
      tag,
    });
  }
  return out;
}

interface Detail { date: string | null; start: string | null; end: string | null; location: string | null; price: string | null; description: string | null }

function parseDetail(html: string): Detail {
  const right = /<div class='right-col'>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '';
  const lines = right
    .replace(/<a [\s\S]*?<\/a>/gi, '\n')
    .split(/<br\s*\/?>|<\/?h3[^>]*>/i)
    .map((l) => decode(l))
    .filter(Boolean);
  let date: string | null = null, start: string | null = null, end: string | null = null;
  let location: string | null = null, price: string | null = null;
  for (const l of lines) {
    const dm = /^(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(l);
    if (dm && MONTHS[dm[1].toLowerCase()]) {
      date = `${dm[3]}-${String(MONTHS[dm[1].toLowerCase()]).padStart(2, '0')}-${dm[2].padStart(2, '0')}`;
      continue;
    }
    const tm = /^(\d{1,2}(?::\d{2})?\s*[ap]m)\s*(?:to|-|–)\s*(\d{1,2}(?::\d{2})?\s*[ap]m)$/i.exec(l);
    if (tm) { start = to24(tm[1]); end = to24(tm[2]); continue; }
    if (/^event type:/i.test(l) || /registration/i.test(l)) continue;
    if (/^\$\s?\d/.test(l)) { price = l.replace(/\s+/g, ''); continue; }
    // Price is sometimes glued to the end of the location line.
    const lp = /^(.*?)\s*(\$\s?\d[\d.,]*)$/.exec(l);
    if (lp) {
      price = price ?? lp[2].replace(/\s+/g, '');
      if (!location && lp[1]) location = lp[1];
      continue;
    }
    if (!location) location = l.replace(/\s*\$\s*$/, '') || null;
  }
  const left = /<div class='left-col'>([\s\S]*?)<\/div><div class='right-col'>/.exec(html)?.[1] ?? '';
  const description = htmlToText(left) || null;
  return { date, start, end, location, price, description };
}

export async function scrapeGfwar(): Promise<EventInput[]> {
  const items: ListItem[] = [];
  const seen = new Set<string>();
  for (const list of LISTS) {
    for (const it of parseList(await getHtml(list.url), list.tag)) {
      if (seen.has(it.slug)) continue;
      seen.add(it.slug);
      items.push(it);
    }
  }
  const out: EventInput[] = [];
  // Small lists (~15 total); fetch detail pages 3 at a time.
  for (let i = 0; i < items.length; i += 3) {
    const batch = items.slice(i, i + 3);
    const details = await Promise.all(batch.map((it) => getHtml(it.url).then(parseDetail).catch(() => null)));
    batch.forEach((it, k) => {
      const d = details[k];
      if (!d?.date) return;
      const startDate = centralIso(d.date, d.start);
      if (!startDate) return;
      const virtual = /virtual|zoom|online/i.test(d.location ?? '');
      out.push({
        externalSource: SOURCE,
        externalId: it.slug,
        publication: PUBLICATION,
        title: `${TITLE_PREFIX}${it.title}`,
        description: d.description,
        link: it.registration ?? it.url,
        startDate,
        endDate: d.end ? centralIso(d.date, d.end) : null,
        location: virtual ? null : d.location,
        organizer: ORGANIZER,
        organizerEmail: null,
        website: it.url,
        tags: it.tag,
        format: virtual ? 'Virtual' : 'In-Person',
        courseNumber: null,
        memberPrice: d.price,
        nonmemberPrice: null,
        imageUrl: it.image,
        imageThumb: it.image,
        instructorName: null,
        instructorBio: null,
        lat: null,
        lng: null,
      });
    });
  }
  return out;
}
