// Parser for Greater Fort Worth Association of REALTORS® monthly market
// report PDFs (produced by the Texas Real Estate Research Center at Texas
// A&M). These PDFs have a real text layer with one area per page:
//
//   Monthly Local Market Report[ - Zip Detail]
//   August 2026
//   Market Analysis By County: Tarrant County   |  By Zip Code*: 76107
//   All(New and Existing)
//   Residential (SF/COND/TH) 2,060 -4.6% $900,962,309 -7.9% $437,360 ...
//
// We read the first "Residential (SF/COND/TH)" row after
// "All(New and Existing)" on each page: closed sales, YoY, dollar volume,
// YoY, avg price, YoY, median price, YoY, $/sqft, YoY, DOM, new listings,
// active listings, pending sales, months inventory, close-to-OLP.

import { getDocumentProxy } from 'unpdf';
import type { DfwMarketReport, DfwMetrics } from '@/lib/dfw-markets';
import { countyKey, monthKeyFromLabel } from '@/lib/dfw-markets';

interface PdfPage { getTextContent(): Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }> }
interface PdfDoc { numPages: number; getPage(n: number): Promise<PdfPage>; destroy?: () => Promise<void> }

async function pdfPages(buffer: Uint8Array): Promise<string[]> {
  const pdf = (await getDocumentProxy(buffer)) as unknown as PdfDoc;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let text = '';
    for (const it of content.items) {
      text += (it.str ?? '') + (it.hasEOL ? '\n' : ' ');
    }
    pages.push(text.replace(/[ \t]+/g, ' '));
  }
  pdf.destroy?.().catch(() => {});
  return pages;
}

const dash = (v: string | undefined): string | null => (!v || v === '-' ? null : v);

function parseRow(tokens: string[]): DfwMetrics | null {
  // Expect 16 tokens; '-' placeholders keep positions stable.
  if (tokens.length < 16) return null;
  const t = tokens.slice(0, 16);
  return {
    closedSales: dash(t[0]),
    closedSalesYoY: dash(t[1]),
    dollarVolume: dash(t[2]),
    dollarVolumeYoY: dash(t[3]),
    averagePrice: dash(t[4]),
    averagePriceYoY: dash(t[5]),
    medianPrice: dash(t[6]),
    medianPriceYoY: dash(t[7]),
    pricePerSqft: dash(t[8]),
    pricePerSqftYoY: dash(t[9]),
    daysOnMarket: dash(t[10]),
    newListings: dash(t[11]),
    activeListings: dash(t[12]),
    pendingSales: dash(t[13]),
    monthsInventory: dash(t[14]),
    closeToListPrice: dash(t[15]),
  };
}

export function parseGfwarPage(text: string, sourceUrl: string): DfwMarketReport | null {
  const flat = text.replace(/\s+/g, ' ');
  const monthM = /Monthly Local Market Report(?: - Zip Detail)?\s+([A-Za-z]+ \d{4})/.exec(flat);
  const month = monthM ? monthKeyFromLabel(monthM[1]) : null;
  if (!month) return null;

  let areaType: DfwMarketReport['areaType'];
  let areaKey: string;
  let areaLabel: string;
  const zip = /Market Analysis By Zip Code\*?:\s*(\d{5})/.exec(flat);
  const county = /Market Analysis By County:\s*([A-Za-z .]+?) County/.exec(flat);
  const area = /Market Analysis By (?:Area|Region|City|MLS Area)\*?:\s*([A-Za-z .'-]+?)\s+(?:Closed|Property)/.exec(flat);
  if (zip) {
    areaType = 'zip'; areaKey = zip[1]; areaLabel = `Zip ${zip[1]}`;
  } else if (county) {
    areaType = 'county'; areaKey = countyKey(county[1].trim()); areaLabel = `${county[1].trim()} County`;
  } else if (area || /Grtr|Greater Fort Worth|Greater Ft/i.test(flat)) {
    areaType = 'region'; areaKey = 'greater-fort-worth'; areaLabel = area ? area[1].trim() : 'Greater Fort Worth';
  } else {
    return null;
  }

  const allIdx = flat.indexOf('All(New and Existing)');
  const seg = allIdx >= 0 ? flat.slice(allIdx) : flat;
  const row = /Residential \(SF\/COND\/TH\)\s+(.*?)\s+YTD:/.exec(seg);
  if (!row) return null;
  const metrics = parseRow(row[1].trim().split(' '));
  if (!metrics) return null;
  return { board: 'gfwar', areaType, areaKey, areaLabel, month, metrics, sourceUrl };
}

/** Download a GFWAR report PDF and parse every page. */
export async function parseGfwarPdf(url: string, buffer?: Uint8Array): Promise<DfwMarketReport[]> {
  let buf = buffer;
  if (!buf) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RealtyNewsNow/1.0)' }, cache: 'no-store' });
    if (!res.ok) throw new Error(`GFWAR PDF HTTP ${res.status}: ${url}`);
    buf = new Uint8Array(await res.arrayBuffer());
  }
  const out: DfwMarketReport[] = [];
  for (const page of await pdfPages(buf)) {
    const r = parseGfwarPage(page, url);
    if (r) out.push(r);
  }
  return out;
}
