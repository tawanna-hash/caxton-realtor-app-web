// lib/server/mailing/trec-import.ts
//
// Imports active TREC sales agents + brokers for the DFW markets into the
// 'dallas-trec' and 'fortworth-trec' mailing segments.
//
// Source: TREC High Value Data Set "Broker and Sales Agent License Holder
// Information" (public, refreshed daily):
//   https://www.trec.texas.gov/sites/default/files/high-value-data-sets/trecfile.txt
// Tab-delimited, 33 columns, latin-1, one row per license.
//
// Market split follows the DFW board coverage: Tarrant / Parker / Johnson
// → Ft. Worth; every other MetroTex county (Denton included) → Dallas.
//
// Idempotent: a license already on its segment is skipped, so re-running
// only adds new licensees. Existing rows are never modified or deleted.

import { getSql } from '@/lib/db';
import type { MailingSegment } from './segments';

export const TREC_FILE_URL =
  'https://www.trec.texas.gov/sites/default/files/high-value-data-sets/trecfile.txt';

// TREC county code = alphabetical index of the 254 Texas counties.
const DFW_COUNTY_CODES: Record<number, string> = {
  43: 'Collin', 57: 'Dallas', 61: 'Denton', 70: 'Ellis', 72: 'Erath', 91: 'Grayson',
  111: 'Hood', 112: 'Hopkins', 116: 'Hunt', 126: 'Johnson', 129: 'Kaufman', 155: 'McLennan',
  175: 'Navarro', 184: 'Parker', 199: 'Rockwall', 213: 'Somervell', 215: 'Stephens',
  220: 'Tarrant', 234: 'Van Zandt', 249: 'Wise',
};
const FT_WORTH_COUNTIES = new Set(['Tarrant', 'Parker', 'Johnson']);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

type Row = {
  segment: MailingSegment;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string;
  license_number: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string;
};

function titleCase(v: string): string {
  return v.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function parseTrecFile(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const cols: string[][] = [];
  for (const line of lines) {
    const c = line.replace(/\u0000/g, '').split('\t').map((x) => x.trim());
    if (c.length === 33) cols.push(c);
  }
  const nameByLicense = new Map<string, string>();
  for (const c of cols) if (!nameByLicense.has(c[1])) nameByLicense.set(c[1], c[2]);

  const rows: Row[] = [];
  for (const c of cols) {
    // Active (status 20) individual license holders only.
    if (c[4] !== '20' || (c[0] !== 'SALE' && c[0] !== 'BRK')) continue;
    const county = DFW_COUNTY_CODES[Number(c[18])];
    if (!county) continue;
    const segment: MailingSegment = FT_WORTH_COUNTIES.has(county) ? 'fortworth-trec' : 'dallas-trec';
    const lastFirst = c[32] || '';
    const comma = lastFirst.indexOf(',');
    const last = comma > 0 ? titleCase(lastFirst.slice(0, comma).trim()) : null;
    const first = comma > 0 ? titleCase(lastFirst.slice(comma + 1).trim()) : c[2];
    const licenseType = c[0] === 'SALE' ? 'Sales Agent' : 'Broker';
    const sponsorNo = c[27] || '';
    const since = c[5].length === 8 ? `${c[5].slice(0, 4)}-${c[5].slice(4, 6)}-${c[5].slice(6, 8)}` : '';
    let notes = `TREC ${licenseType} #${c[1]} · ${county} County`;
    if (sponsorNo) notes += ` · Sponsor #${sponsorNo}`;
    if (since) notes += ` · Licensed ${since}`;
    rows.push({
      segment,
      first_name: first || c[2] || '(no name)',
      last_name: last,
      email: EMAIL_RE.test(c[11]) ? c[11].toLowerCase() : null,
      phone: c[10] || null,
      company: sponsorNo ? nameByLicense.get(sponsorNo) ?? null : null,
      title: licenseType,
      license_number: c[1],
      address: [c[12], c[13], c[14]].filter(Boolean).join(' ') || null,
      city: c[15] ? titleCase(c[15]) : null,
      state: c[16] || null,
      zip: c[17] ? c[17].slice(0, 5) : null,
      notes,
    });
  }
  return rows;
}

export async function importTrecDfw(): Promise<{
  parsed: { dallas: number; fortworth: number };
  inserted: { dallas: number; fortworth: number };
}> {
  const res = await fetch(TREC_FILE_URL, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`TREC download failed: HTTP ${res.status}`);
  const text = new TextDecoder('latin1').decode(await res.arrayBuffer());
  const rows = parseTrecFile(text);

  const sql = getSql();
  const parsed = { dallas: 0, fortworth: 0 };
  const inserted = { dallas: 0, fortworth: 0 };
  for (const r of rows) parsed[r.segment === 'dallas-trec' ? 'dallas' : 'fortworth'] += 1;

  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const out = (await sql`
      INSERT INTO mailing_contacts
        (segment, first_name, last_name, email, phone, company, title, license_number,
         address, city, state, zip, notes, source, tags)
      SELECT r.segment, r.first_name, r.last_name, r.email, r.phone, r.company, r.title,
             r.license_number, r.address, r.city, r.state, r.zip, r.notes, 'trec',
             jsonb_build_array(r.segment)
        FROM jsonb_to_recordset(${JSON.stringify(slice)}::jsonb) AS r(
          segment text, first_name text, last_name text, email text, phone text, company text,
          title text, license_number text, address text, city text, state text, zip text, notes text)
       WHERE NOT EXISTS (
         SELECT 1 FROM mailing_contacts m
          WHERE m.segment = r.segment AND m.license_number = r.license_number
       )
      RETURNING segment
    `) as unknown as Array<{ segment: string }>;
    for (const o of out) inserted[o.segment === 'dallas-trec' ? 'dallas' : 'fortworth'] += 1;
  }
  return { parsed, inserted };
}
