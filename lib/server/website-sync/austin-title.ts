// lib/server/website-sync/austin-title.ts
//
// Domain-specific website sync for austintitle.com.
// Fetches the static HTML of two pages:
//   1) /locations    -> list of office locations (label + address + phone)
//   2) /about/our-team -> list of staff (name + title + email),
//                        grouped by H2 sections that match location names.
//
// Returns the data shaped like ExtractedScreenshot so it can be fed into
// the existing dedupe-aware website-sync upsert path.

import type { ExtractedLocation, ExtractedStaffMember } from '../gemini-screenshot-extract';

const LOCATIONS_URL = 'https://www.austintitle.com/locations';
const TEAM_URL = 'https://www.austintitle.com/about/our-team';

const USER_AGENT =
  'Mozilla/5.0 (compatible; RealtyNewsNow-Sync/1.0; +https://realtynewsnow.app)';

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  // austintitle uses middot separators like "512·459·7222"
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    // Static pages on austintitle.com; 20s ceiling.
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

interface ParsedAddress {
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

// Parse a block like:
//   "Stonebridge Plaza II <br/> 9600 North Mopac Expy <br/> Suite 125 <br/> Austin, TX 78759"
// or just:
//   "1717 W. 6th Street <br/> Suite 102 <br/> Austin, TX 78703"
function parseAddressBlock(text: string): ParsedAddress {
  const lines = text
    .split(/<br\s*\/?\s*>|\n/i)
    .map((l) => stripTags(l))
    .filter(Boolean);

  // Find the city/state/zip line. Most cards put it last ("Austin, TX 78759"),
  // but austintitle uses several malformed variants:
  //   "Austin, TX 78759"          (canonical)
  //   "Austin, 78731"             (state omitted — assume TX, the only state
  //                                they operate in)
  //   "Bastrop, TX 78602" followed by extra parking/instructions lines that
  //                                push the city/state/zip mid-block.
  let city: string | null = null;
  let state: string | null = null;
  let zip: string | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const ln = lines[i];
    const full = ln.match(/^(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
    if (full) {
      city = full[1].trim();
      state = full[2].trim();
      zip = full[3].trim();
      lines.splice(i, 1);
      break;
    }
    const noState = ln.match(/^(.+?),\s*(\d{5}(?:-\d{4})?)\s*$/);
    if (noState) {
      city = noState[1].trim();
      state = 'TX'; // austintitle.com is Texas-only
      zip = noState[2].trim();
      lines.splice(i, 1);
      break;
    }
  }

  // Detect suite/building lines and merge into address_2
  let address: string | null = null;
  let address_2: string | null = null;
  const remaining = [...lines];
  // If the first line doesn't look like a street number, treat it as a
  // building name we discard (e.g. "Stonebridge Plaza II"). Heuristic:
  // street lines start with a digit OR contain "Highway"/"US Hwy".
  if (remaining.length && !/^\s*(\d|us\s|highway)/i.test(remaining[0])) {
    remaining.shift();
  }
  if (remaining.length >= 1) address = remaining[0] || null;
  if (remaining.length >= 2) {
    address_2 = remaining.slice(1).join(', ');
  }

  return { address, address_2, city, state, zip };
}

// Parse austintitle.com /locations into ExtractedLocation[]
export function parseLocationsHtml(html: string): ExtractedLocation[] {
  const locations: ExtractedLocation[] = [];

  // Each office card opens with: <h3 ...><a href="...">LABEL</a></h3>
  // followed by <p class="smol mb-15">ADDRESS BLOCK</p>
  // and then <a ... href="tel:PHONE">PHONE</a>
  const cardRe =
    /<h3[^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h3>\s*<p[^>]*class="[^"]*smol[^"]*"[^>]*>([\s\S]*?)<\/p>([\s\S]*?)(?=<h3|<\/div>\s*<\/div>\s*<\/div>)/gi;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const label = stripTags(m[1]);
    const addrBlock = m[2];
    const tail = m[3];

    const addr = parseAddressBlock(addrBlock);

    // Phone is the first tel: link in the tail.
    let phone: string | null = null;
    const telMatch = tail.match(/href\s*=\s*"tel:([^"]+)"/i);
    if (telMatch) phone = normalizePhone(telMatch[1]);

    // Skip virtual "locations" like "Bilingual Escrow Dept" that have no
    // street address (their card body is descriptive text only).
    if (!addr.address) continue;

    locations.push({
      label,
      address: addr.address,
      address_2: addr.address_2,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      phone,
      email: null,
      hours: null,
      // First office card in the source ("North Mopac") is the HQ in their
      // ordering. We don't assert is_primary here — the insert path already
      // skips setting is_primary when an existing primary exists, and the
      // first location flagged true wins.
      is_primary: locations.length === 0,
    });
  }

  return locations;
}

// Parse /about/our-team into ExtractedStaffMember[] and tag each with the
// office section they belong to (so we can attach them to the right
// location_index after we know the location order).
interface StaffWithSection {
  staff: ExtractedStaffMember;
  section: string; // H2 text the card appeared under, e.g. "Hartland Plaza"
}

export function parseTeamHtml(html: string): StaffWithSection[] {
  const out: StaffWithSection[] = [];

  // Find each H2 marker location and use it to assign sections.
  const sections: Array<{ name: string; start: number; end: number }> = [];
  const h2Re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  const h2Matches: Array<{ name: string; start: number }> = [];
  let mh: RegExpExecArray | null;
  while ((mh = h2Re.exec(html)) !== null) {
    h2Matches.push({ name: stripTags(mh[1]), start: mh.index });
  }
  for (let i = 0; i < h2Matches.length; i++) {
    sections.push({
      name: h2Matches[i].name,
      start: h2Matches[i].start,
      end: i + 1 < h2Matches.length ? h2Matches[i + 1].start : html.length,
    });
  }

  // Skip non-office sections.
  const SKIP_SECTIONS = new Set([
    'Careers',
    'Our Team',
    'The Latest Austin Title News',
  ]);

  // Each staff card looks like:
  //   <img src="HEADSHOT" ...>
  //   <h4 ...><a href="...">FULL NAME</a></h4>
  //   <h6 ...>TITLE</h6>
  //   <a href="mailto:EMAIL" ...>EMAIL</a>
  // We scan with a single regex that captures name+title+email together.
  const cardRe =
    /<h4[^>]*class="[^"]*dark-blue[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>\s*<\/h4>\s*<h6[^>]*>([^<]*)<\/h6>[\s\S]{0,600}?<a[^>]*href="mailto:([^"]+)"/gi;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(html)) !== null) {
    const name = stripTags(m[1]);
    const title = stripTags(m[2]) || null;
    const email = m[3].trim().toLowerCase();
    const pos = m.index;

    const section = sections.find((s) => pos >= s.start && pos < s.end);
    const sectionName = section?.name ?? '';
    if (SKIP_SECTIONS.has(sectionName)) continue;

    // Try to capture the headshot URL in the preceding 400 chars.
    let photo_url: string | null = null;
    const before = html.slice(Math.max(0, pos - 600), pos);
    const imgMatch = before.match(/<img\s+src="([^"]+headshot[^"]+)"/i);
    if (imgMatch) {
      const src = imgMatch[1];
      photo_url = src.startsWith('http') ? src : `https://www.austintitle.com${src}`;
    }

    out.push({
      section: sectionName,
      staff: {
        name,
        title,
        email,
        phone: null,
        photo_url,
        location_index: null, // resolved later once we know location order
      },
    });
  }

  return out;
}

// Map team-page H2 section names to /locations h3 labels.
// "Management" and "Business Development" don't map to a specific office
// — staff there get location_index = null (works at HQ / cross-office).
const SECTION_TO_LOCATION_LABEL: Record<string, string> = {
  'North Mopac': 'North Mopac',
  'Hartland Plaza': 'Hartland Plaza',
  'South Mopac': 'South Mopac',
  'Round Rock': 'Round Rock',
  'Leander': 'Leander',
  'Cedar Park': 'Cedar Park',
  'Bilingual Escrow Dept': 'North Mopac', // bilingual desk lives at North Mopac HQ
  'Georgetown': 'Georgetown',
  'Salado': 'Salado',
  'Bastrop': 'Bastrop',
  'Elgin': 'Elgin',
  'The Grove': 'The Grove',
};

export interface AustinTitleSyncResult {
  locations: ExtractedLocation[];
  staff: ExtractedStaffMember[];
}

export async function fetchAustinTitleSync(): Promise<AustinTitleSyncResult> {
  const [locHtml, teamHtml] = await Promise.all([
    fetchHtml(LOCATIONS_URL),
    fetchHtml(TEAM_URL),
  ]);

  const locations = parseLocationsHtml(locHtml);
  const staffWithSection = parseTeamHtml(teamHtml);

  // Build label -> 1-based index map (locations array order is preserved).
  const labelToIdx = new Map<string, number>();
  locations.forEach((loc, i) => {
    if (loc.label) labelToIdx.set(loc.label.toLowerCase(), i + 1);
  });

  const staff: ExtractedStaffMember[] = staffWithSection.map(({ staff, section }) => {
    const targetLabel = SECTION_TO_LOCATION_LABEL[section];
    let idx: number | null = null;
    if (targetLabel) {
      idx = labelToIdx.get(targetLabel.toLowerCase()) ?? null;
    }
    return { ...staff, location_index: idx };
  });

  return { locations, staff };
}
