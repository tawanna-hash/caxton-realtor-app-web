// Server-only property lookup used by the Agent Desk Contract page.
//
//  1. County, any Texas address: US Census Geocoder (free, no key).
//  2. Appraisal-district fields (property type, legal description, neighborhood, account,
//     map number, effective acres, owner mailing address): Williamson CAD only for now.
//     Other counties return county only until an adapter is added.
//
// Only fixed public hosts are contacted; nothing from the request is used as a host or path.

export type PropertyLookupResult = {
  matchedAddress: string;
  county: string;
  cad: null | {
    district: string;
    sourceUrl: string;
    propertyType: string;
    legalDescription: string;
    neighborhood: string;
    account: string;
    mapNumber: string;
    effectiveAcres: string;
    mailingAddress: string;
  };
};

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const WCAD = 'https://search.wcad.org';
const TIMEOUT_MS = 10000;

async function getText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 (RealtyLine property lookup)' }, cache: 'no-store' });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

const clean = (v: string) => v.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s*\n\s*/g, ', ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();

function field(html: string, label: string): string {
  const m = html.match(new RegExp(`<td[^>]*class="fieldLabel"[^>]*>\\s*${label}\\s*</td>\\s*<td[^>]*class="fieldData"[^>]*>([\\s\\S]*?)</td>`, 'i'));
  return m ? clean(m[1]) : '';
}

async function williamsonLookup(address: string): Promise<PropertyLookupResult['cad']> {
  const street = address.split(',')[0].trim().replace(/[#.]/g, ' ').replace(/\s+/g, ' ');
  const zip = (address.match(/\b(\d{5})(?:-\d{4})?\s*$/) ?? [])[1] ?? '';
  const tokens = street.toUpperCase().split(' ');
  if (tokens.length < 2 || !/^\d+$/.test(tokens[0])) return null;
  const tries = [tokens.slice(0, -1).join(' '), street];
  for (const q of tries) {
    if (q.split(' ').length < 2) continue;
    const text = await getText(`${WCAD}/ProxyT/Search/Properties/quick/?f=${encodeURIComponent(q)}&pn=1&st=4&so=desc&pt=RP&ty=${new Date().getFullYear() + 1}`);
    if (!text) continue;
    let list: Array<{ PropertyQuickRefID?: string; PartyQuickRefID?: string; SitusAddress?: string }> = [];
    try { list = (JSON.parse(text) as { ResultList?: typeof list }).ResultList ?? []; } catch { continue; }
    let hits = list.filter((r) => {
      const s = (r.SitusAddress ?? '').toUpperCase().replace(/\s+/g, ' ').split(' ');
      return s[0] === tokens[0] && s[1] === tokens[1];
    });
    if (hits.length > 1 && zip) hits = hits.filter((r) => (r.SitusAddress ?? '').includes(zip));
    if (hits.length === 1 && hits[0].PropertyQuickRefID && /^[A-Z0-9]+$/.test(hits[0].PropertyQuickRefID)) {
      const party = hits[0].PartyQuickRefID && /^[A-Z0-9]+$/.test(hits[0].PartyQuickRefID) ? `/PartyQuickRefID/${hits[0].PartyQuickRefID}` : '';
      const url = `${WCAD}/Property-Detail/PropertyQuickRefID/${hits[0].PropertyQuickRefID}${party}`;
      const html = await getText(url);
      if (!html) return null;
      const legal = field(html, 'Legal Description');
      if (!legal && !field(html, 'Account')) return null;
      return {
        district: 'Williamson CAD', sourceUrl: url,
        propertyType: field(html, 'Property Type'), legalDescription: legal, neighborhood: field(html, 'Neighborhood'),
        account: field(html, 'Account'), mapNumber: field(html, 'Map Number'), effectiveAcres: field(html, 'Effective Acres'),
        mailingAddress: field(html, 'Mailing Address'),
      };
    }
  }
  return null;
}

export async function lookupProperty(address: string): Promise<PropertyLookupResult | null> {
  const text = await getText(`${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
  if (!text) return null;
  type Match = { matchedAddress: string; addressComponents?: { state?: string }; geographies?: { Counties?: Array<{ NAME?: string }> } };
  let match: Match | undefined;
  try { match = (JSON.parse(text) as { result?: { addressMatches?: Match[] } }).result?.addressMatches?.[0]; } catch { return null; }
  const county = (match?.geographies?.Counties?.[0]?.NAME ?? '').replace(/\s+County$/i, '').trim();
  if (!match || !county || match.addressComponents?.state !== 'TX') return null;
  const cad = county.toLowerCase() === 'williamson' ? await williamsonLookup(address) : null;
  return { matchedAddress: match.matchedAddress, county, cad };
}
