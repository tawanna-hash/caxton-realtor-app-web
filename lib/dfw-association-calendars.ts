// Dallas/Ft. Worth association calendar importers. Every event is stored with
// publication = 'dallas' and the title prefixed with the association name.
//
//   arbor    Arlington Board of REALTORS (Tangilla feed, association 7845)
//   gdwcar   Greater Denton/Wise County Association of REALTORS (GrowthZone)
//   granbury Granbury Association of REALTORS (agentbook JSON API)
//   texoma   Greater Texoma Association of REALTORS (GrowthZone)
//   gmwar    Greater Metro West Association of REALTORS (GrowthZone)

import type { EventInput } from './events-store';
import { centralIso, htmlToText, normalizeTangilla, type TangillaEvent } from './metrotex-scraper';

export type DfwAssociationKey = 'arbor' | 'gdwcar' | 'granbury' | 'texoma' | 'gmwar';

const UA = 'Mozilla/5.0 (compatible; RealtyNewsNow-Calendar/1.0; +https://realtynewsnow.app)';
const TIMEOUT_MS = 25_000;
const PUBLICATION = 'dallas' as const;
const MAX_SPAN_DAYS = 45; // skip long-running "campaign" entries that are not events
const WINDOW_DAYS = 240;

export const DFW_ASSOCIATIONS: Record<DfwAssociationKey, { prefix: string; name: string }> = {
  arbor: { prefix: 'Arlington: ', name: 'Arlington Board of REALTORS®' },
  gdwcar: { prefix: 'Greater Denton/Wise: ', name: 'Greater Denton/Wise County Association of REALTORS®' },
  granbury: { prefix: 'Granbury: ', name: 'Granbury Association of REALTORS®' },
  texoma: { prefix: 'Greater Texoma: ', name: 'Greater Texoma Association of REALTORS®' },
  gmwar: { prefix: 'Greater Metro West: ', name: 'Greater Metro West Association of REALTORS®' },
};

async function get(url: string, accept: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: accept }, signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? '').replace(/\s+/g, ' ').trim();
  return s || null;
};
const decode = (s: string): string => htmlToText(s).replace(/&reg;/g, '®').replace(/&trade;/g, '™').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const VIRTUAL_RE = /\b(virtual|zoom|webinar|online|teams meeting)\b/i;
const pad = (n: number | string) => String(n).padStart(2, '0');

// ---------------------------------------------------------------- ARBOR ----
export async function scrapeArbor(): Promise<EventInput[]> {
  const raw = JSON.parse(await get('https://api.tangilla.com/event/v1/feed/7845/live', 'application/json'));
  if (!Array.isArray(raw)) throw new Error('ARBOR feed: expected an array');
  const cfg = {
    source: 'arbor' as const,
    titlePrefix: DFW_ASSOCIATIONS.arbor.prefix,
    organizer: DFW_ASSOCIATIONS.arbor.name,
    membersOnlyLabel: 'Arlington Board of REALTORS® members only.',
  };
  const out: EventInput[] = [];
  for (const item of raw as TangillaEvent[]) {
    const ev = normalizeTangilla(item, cfg);
    if (ev) out.push(ev);
  }
  return out;
}

// -------------------------------------------------------------- GRANBURY ---
interface GranburyEvent {
  slug: string;
  name: string;
  description?: string | null;
  category?: Array<{ name?: string }>;
  virtual?: boolean;
  in_person?: boolean;
  in_person_config?: {
    address_data?: { name?: string; address?: string; city?: string; state?: string; postal_code?: string };
    in_person_price?: { tiers?: Array<{ name?: string; price?: string }> };
  };
  all_event_timings?: Array<{ start_date?: string; end_date?: string }>;
  event_timings?: Array<{ original_start_date?: string }>;
  third_party_in_person_link?: string | null;
}

const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** "Oct 6, 2026 11:15 AM" -> { date: '2026-10-06', time: '11:15:00' } */
function parseGranburyStamp(s: string | undefined): { date: string; time: string } | null {
  const m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M))?/i.exec((s ?? '').trim());
  if (!m || !MON[m[1].toLowerCase()]) return null;
  let h = m[4] ? Number(m[4]) % 12 : 0;
  if (m[6] && m[6].toUpperCase() === 'PM') h += 12;
  return { date: `${m[3]}-${MON[m[1].toLowerCase()]}-${pad(m[2])}`, time: `${pad(h)}:${m[5] ?? '00'}:00` };
}

export async function scrapeGranbury(): Promise<EventInput[]> {
  const json = JSON.parse(await get('https://granburyrealtors.com/api/proxy/events/list?category=&module=events', 'application/json')) as { data?: GranburyEvent[] | Record<string, unknown> };
  const list: GranburyEvent[] = Array.isArray(json.data)
    ? json.data
    : ((Object.values(json.data ?? {}).find((v) => Array.isArray(v)) as GranburyEvent[] | undefined) ?? []);
  const a = DFW_ASSOCIATIONS.granbury;
  const out: EventInput[] = [];
  for (const e of list) {
    const t = e.all_event_timings?.[0];
    const start = parseGranburyStamp(t?.start_date);
    if (!e.slug || !e.name || !start) continue;
    const end = parseGranburyStamp(t?.end_date);
    const title = e.name.replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*[-–:]?\s*/, '').trim() || e.name;
    const addr = e.in_person_config?.address_data;
    const virtual = !!e.virtual && !e.in_person;
    const location = virtual ? null : clean([addr?.name, addr?.address, addr?.city, addr?.state, addr?.postal_code].filter(Boolean).join(', '));
    const tier = e.in_person_config?.in_person_price?.tiers?.[0];
    const price = tier?.price ? (Number(tier.price) === 0 ? 'Free' : `$${tier.price}`) : null;
    const link = clean(e.third_party_in_person_link) ?? `https://granburyrealtors.com/events/${e.slug}`;
    out.push({
      externalSource: 'granbury',
      externalId: e.slug,
      publication: PUBLICATION,
      title: `${a.prefix}${title}`,
      description: htmlToText(e.description) || null,
      link,
      startDate: centralIso(start.date, start.time),
      endDate: end ? centralIso(end.date, end.time) : null,
      location,
      organizer: a.name,
      organizerEmail: null,
      website: `https://granburyrealtors.com/events/${e.slug}`,
      tags: clean((e.category ?? []).map((c) => c.name).filter(Boolean).join(',')),
      format: virtual ? 'Virtual' : 'In-Person',
      courseNumber: null,
      memberPrice: price,
      nonmemberPrice: null,
      imageUrl: null,
      imageThumb: null,
      instructorName: null,
      instructorBio: null,
      lat: null,
      lng: null,
    });
  }
  return out;
}

// ------------------------------------------------------------ GROWTHZONE ---
const GROWTHZONE = {
  gdwcar: { base: 'https://members.gdwcar.com', path: '/event-calendar' },
  texoma: { base: 'https://greatertexomaassociationofrealtors.growthzoneapp.com', path: '/calendar' },
  gmwar: { base: 'https://members.gmwar.org', path: '/eventcalendar' },
} as const;

/** "10/21/2026 9:00:00 AM" -> { date: '2026-10-21', time: '09:00:00' } */
function parseGzStamp(s: string | undefined): { date: string; time: string } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)$/i.exec((s ?? '').trim());
  if (!m) return null;
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === 'PM') h += 12;
  return { date: `${m[3]}-${pad(m[1])}-${pad(m[2])}`, time: `${pad(h)}:${m[5]}:00` };
}

interface GzCard { id: string; url: string; title: string; start: string; end: string | null; description: string | null; image: string | null; register: string | null }

function parseGzList(html: string): GzCard[] {
  const out: GzCard[] = [];
  for (const block of html.split(/<div class="card gz-events-card"/).slice(1)) {
    const a = /<a href="([^"]+)"[^>]*class="gz-card-title[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    const st = /itemprop="startDate" content="([^"]+)"/.exec(block);
    if (!a || !st) continue;
    const idm = /-(\d{5,})(?:\?|$)/.exec(a[1]);
    const en = /itemprop="endDate" content="([^"]+)"/.exec(block);
    const desc = /itemprop="about">([\s\S]*?)<\/p>/.exec(block);
    const img = /<img[^>]*itemprop="image"[^>]*src="([^"]+)"/.exec(block);
    const reg = /gz-register-btn"\s*href="([^"]+)"/.exec(block) ?? /href="([^"]+)"[^>]*gz-register-btn/.exec(block);
    out.push({
      id: idm ? idm[1] : a[1],
      url: a[1].replace(/&amp;/g, '&'),
      title: decode(a[2]),
      start: st[1],
      end: en ? en[1] : null,
      description: desc ? decode(desc[1]) || null : null,
      image: img ? img[1].replace(/&amp;/g, '&') : null,
      register: reg ? reg[1].replace(/&amp;/g, '&') : null,
    });
  }
  return out;
}

interface GzDetail { description: string | null; location: string | null; price: string | null }

function parseGzDetail(html: string): GzDetail {
  const desc = /<div class="row gz-event-description">[\s\S]*?<\/h3>([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
  const addr = /<div class="card-text gz-event-address">([\s\S]*?)<\/div>/.exec(html);
  let location: string | null = null;
  if (addr) {
    const get1 = (cls: string) => decode(new RegExp(`class="${cls}"[^>]*>([\\s\\S]*?)</span>`).exec(addr[1])?.[1] ?? '');
    const name = decode(/<strong>([\s\S]*?)<\/strong>/.exec(addr[1])?.[1] ?? '');
    const parts = [name, get1('gz-street-address'), get1('gz-city'), get1('gz-state'), get1('gz-zip')].filter(Boolean);
    location = parts.length ? parts.join(', ') : null;
  }
  const pr = /gz-event-pricing-info">([\s\S]*?)<\/span>/.exec(html);
  const prText = pr ? decode(pr[1]) : '';
  const money = /\$\s?\d[\d,.]*/.exec(prText);
  const price = /free/i.test(prText) && !money ? 'Free' : money ? money[0].replace(/\s+/g, '') : null;
  return { description: desc ? decode(desc[1]) || null : null, location, price };
}

async function scrapeGrowthZone(key: keyof typeof GROWTHZONE): Promise<EventInput[]> {
  const { base, path } = GROWTHZONE[key];
  const a = DFW_ASSOCIATIONS[key];
  const from = new Date();
  const to = new Date(Date.now() + WINDOW_DAYS * 86_400_000);
  const fmt = (d: Date) => `${pad(d.getMonth() + 1)}%2f${pad(d.getDate())}%2f${d.getFullYear()}`;
  const html = await get(`${base}${path}/Search?from=${fmt(from)}&to=${fmt(to)}&mode=0`, 'text/html');
  const cards = parseGzList(html);

  const out: EventInput[] = [];
  for (let i = 0; i < cards.length; i += 3) {
    const batch = cards.slice(i, i + 3);
    const details = await Promise.all(batch.map((c) => get(c.url, 'text/html').then(parseGzDetail).catch(() => null)));
    batch.forEach((c, k) => {
      const s = parseGzStamp(c.start);
      if (!s || /\bcancell?ed\b/i.test(c.title)) return;
      const e = parseGzStamp(c.end ?? undefined);
      if (e) {
        const span = (Date.parse(`${e.date}T00:00:00Z`) - Date.parse(`${s.date}T00:00:00Z`)) / 86_400_000;
        if (span > MAX_SPAN_DAYS) return;
      }
      const d = details[k];
      const text = `${c.title} ${d?.description ?? c.description ?? ''} ${d?.location ?? ''}`;
      const virtual = VIRTUAL_RE.test(text) && !d?.location;
      out.push({
        externalSource: key,
        externalId: c.id,
        publication: PUBLICATION,
        title: `${a.prefix}${c.title}`,
        description: d?.description ?? c.description,
        link: c.register ?? c.url,
        startDate: centralIso(s.date, s.time),
        endDate: e && e.date === s.date ? centralIso(e.date, e.time) : e ? centralIso(e.date, e.time) : null,
        location: virtual ? null : d?.location ?? null,
        organizer: a.name,
        organizerEmail: null,
        website: c.url,
        tags: null,
        format: virtual ? 'Virtual' : 'In-Person',
        courseNumber: null,
        memberPrice: d?.price ?? null,
        nonmemberPrice: null,
        imageUrl: c.image,
        imageThumb: c.image,
        instructorName: null,
        instructorBio: null,
        lat: null,
        lng: null,
      });
    });
  }
  return out;
}

export const scrapeGdwcar = () => scrapeGrowthZone('gdwcar');
export const scrapeTexoma = () => scrapeGrowthZone('texoma');
export const scrapeGmwar = () => scrapeGrowthZone('gmwar');

export const DFW_ASSOCIATION_SCRAPERS: Record<DfwAssociationKey, () => Promise<EventInput[]>> = {
  arbor: scrapeArbor,
  gdwcar: scrapeGdwcar,
  granbury: scrapeGranbury,
  texoma: scrapeTexoma,
  gmwar: scrapeGmwar,
};
