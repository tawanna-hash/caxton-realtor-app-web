// MetroTex monthly housing-report importer (Dallas side of Dallas/Ft. Worth).
//
// MetroTex publishes one infographic per county plus a DFW Metroplex summary
// on https://www.mymetrotex.com/market-reports/ (data: Texas Real Estate
// Research Center at Texas A&M). The page itself is bot-protected, but the
// images are plain WordPress uploads with a predictable name:
//   /wp-content/uploads/<upload YYYY/MM>/<Name>_Housing-Report_<Month>-<YYYY>.png
// The upload folder is usually the month after the report month. Numbers are
// read from the graphic with Gemini vision (same key as the SABOR import).

import { METROTEX_COUNTIES, countyKey, monthLabel, type DfwMarketReport, type DfwMetrics } from '@/lib/dfw-markets';

const BASE = 'https://www.mymetrotex.com/wp-content/uploads';
const UA = 'Mozilla/5.0 (compatible; RealtyNewsNow/1.0)';
const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface MetroTexArea { areaType: 'region' | 'county'; areaKey: string; areaLabel: string; file: string; spanish: boolean }

export const METROTEX_AREAS: MetroTexArea[] = [
  { areaType: 'region', areaKey: 'dfw-metroplex', areaLabel: 'DFW Metroplex', file: 'DFW-Metroplex', spanish: true },
  ...METROTEX_COUNTIES.map((c) => ({
    areaType: 'county' as const,
    areaKey: countyKey(c),
    areaLabel: `${c} County`,
    file: `${c.replace(/\s+/g, '-')}-County`,
    spanish: false,
  })),
];

function uploadFolders(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const out: string[] = [];
  for (const add of [1, 0, 2]) {
    const d = new Date(Date.UTC(y, m - 1 + add, 1));
    out.push(`${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

async function exists(url: string): Promise<boolean> {
  // MetroTex sits behind Cloudflare, which intermittently refuses bursts of
  // requests from server IPs. Retry (HEAD, then a 1-byte GET) with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, {
        method: attempt === 0 ? 'HEAD' : 'GET',
        headers: attempt === 0 ? { 'User-Agent': UA } : { 'User-Agent': UA, Range: 'bytes=0-0' },
        cache: 'no-store',
      });
      if (r.status === 404) return false;
      if (r.ok && (r.headers.get('content-type') ?? '').startsWith('image/')) return true;
    } catch {
      // fall through to retry
    }
    await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
  }
  return false;
}

/** Find the English (and Spanish, when published) graphic URLs for an area/month. */
export async function findMetroTexGraphic(area: MetroTexArea, month: string): Promise<{ en: string; es: string | null } | null> {
  const [name, year] = monthLabel(month).split(' ');
  const stem = `${area.file}_Housing-Report_${name}-${year}`;
  for (const folder of uploadFolders(month)) {
    const en = `${BASE}/${folder}/${stem}.png`;
    if (await exists(en)) {
      let es: string | null = null;
      if (area.spanish) {
        const cand = `${BASE}/${folder}/${stem}_Spanish.png`;
        if (await exists(cand)) es = cand;
      }
      return { en, es };
    }
  }
  return null;
}

const PROMPT = `This is a MetroTex Association of REALTORS monthly housing report infographic. Return ONLY a JSON object with these string fields (use null when not shown; keep "$", "%" and commas exactly as printed; give YoY/percent changes a leading "-" when the arrow points down or text says less/decrease, "+" when up):
{"medianPrice":"$365,000","medianPriceYoY":"0.0%","marketSharePct":"24.1%","marketShareBand":"$300,000 - $399,999","activeListings":"7,454","activeListingsYoY":"-6.1%","closedSales":"1,626","closedSalesYoY":"-6.3%","daysOnMarket":"52","daysToClose":"29","daysTotal":"81","daysNote":"2 days less than August 2025","monthsInventory":"4.5","monthsInventoryPrior":"4.7","reportMonth":"August 2026","areaName":"Dallas County"}`;

export async function extractMetroTexGraphic(imageUrl: string): Promise<(DfwMetrics & { reportMonth?: string; areaName?: string }) | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const img = await fetch(imageUrl, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!img.ok) return null;
  const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data: b64 } }, { text: PROMPT }] }],
      generation_config: {
        temperature: 0,
        response_mime_type: 'application/json',
        max_output_tokens: 4096,
        // Small structured read; thinking tokens only risk truncating the JSON.
        thinking_config: { thinking_budget: 0 },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const payload = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    const obj = JSON.parse(text.replace(/^```json\s*|```$/g, '')) as Record<string, unknown>;
    const out: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = v == null || v === '' ? null : String(v);
    return out as DfwMetrics & { reportMonth?: string; areaName?: string };
  } catch {
    return null;
  }
}

/**
 * Import one report month. Areas already stored for that month are skipped
 * unless `force` is set, so the daily cron doesn't re-read every graphic.
 */
export async function importMetroTexMonth(
  month: string,
  skip: Set<string>,
  opts: { force?: boolean; deadline?: number } = {},
): Promise<{ reports: DfwMarketReport[]; missing: string[]; failed: string[] }> {
  const reports: DfwMarketReport[] = [];
  const missing: string[] = [];
  const failed: string[] = [];
  const todo = METROTEX_AREAS.filter((a) => opts.force || !skip.has(`${a.areaKey}|${month}`));
  // Small parallel batches keep us well inside Gemini rate limits.
  for (let i = 0; i < todo.length; i += 3) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    await Promise.all(
      todo.slice(i, i + 3).map(async (area) => {
        const g = await findMetroTexGraphic(area, month);
        if (!g) { missing.push(area.areaLabel); return; }
        try {
          let m = await extractMetroTexGraphic(g.en);
          if (!m || !m.medianPrice) m = await extractMetroTexGraphic(g.en);
          if (!m || !m.medianPrice) { failed.push(area.areaLabel); return; }
          const { reportMonth: _rm, areaName: _an, ...metrics } = m;
          void _rm; void _an;
          reports.push({
            board: 'metrotex', areaType: area.areaType, areaKey: area.areaKey, areaLabel: area.areaLabel,
            month, metrics, sourceUrl: 'https://www.mymetrotex.com/market-reports/', imageUrl: g.en, imageUrlEs: g.es,
          });
        } catch (e) {
          failed.push(`${area.areaLabel}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
        }
      }),
    );
  }
  return { reports, missing, failed };
}
