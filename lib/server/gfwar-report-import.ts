// GFWAR (Ft. Worth side) report discovery: reads the public county-report
// and Fort Worth market-report listing pages, picks the newest PDF for the
// Greater Fort Worth Zip Detail report and each GFWAR county, and parses
// them with gfwar-report-parser.

import { GFWAR_COUNTIES, type DfwMarketReport } from '@/lib/dfw-markets';
import { parseGfwarPdf } from './gfwar-report-parser';

const UA = 'Mozilla/5.0 (compatible; RealtyNewsNow/1.0)';

async function pdfLinks(page: string): Promise<string[]> {
  const res = await fetch(page, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`GFWAR ${page} HTTP ${res.status}`);
  const html = await res.text();
  const out: string[] = [];
  for (const m of html.matchAll(/href=["'](https:\/\/gfwar\.org\/wp-content\/uploads\/[^"']+\.pdf)["']/gi)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out; // page order = newest first
}

export async function importGfwarLatest(): Promise<{ reports: DfwMarketReport[]; files: string[]; errors: string[] }> {
  const errors: string[] = [];
  const files: string[] = [];
  const [county, fw] = await Promise.all([
    pdfLinks('https://gfwar.org/county-report/').catch((e) => { errors.push(String(e)); return []; }),
    pdfLinks('https://gfwar.org/fort-worth-market-reports/').catch((e) => { errors.push(String(e)); return []; }),
  ]);
  const zip = fw.find((u) => /Zip-Detail/i.test(u));
  if (zip) files.push(zip);
  for (const c of GFWAR_COUNTIES) {
    const u = county.find((x) => new RegExp(`${c}-County`, 'i').test(x));
    if (u) files.push(u);
  }
  const reports: DfwMarketReport[] = [];
  for (const f of files) {
    try {
      reports.push(...(await parseGfwarPdf(f)));
    } catch (e) {
      errors.push(`${f}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { reports, files, errors };
}
