/**
 * Gemini-powered RealtyLine (ABoR / UnlockMLS) infographic extractor.
 *
 * Used by /api/admin/realtyline-mls/import-graphic to autopopulate the
 * RealtyLine report editor from an uploaded UnlockMLS monthly stats
 * screenshot (or PDF). Reads the "Sales" block only; leases are ignored.
 *
 * Mirrors gemini-sabor-extract.ts pattern: raw fetch to Google's
 * generativelanguage REST API — no SDK dependency.
 *
 * Never throws — every failure mode returns an error sentinel.
 */

import { logger } from './logger';

type DeltaDirection = 'up' | 'down' | 'flat';

interface IndicatorStat {
  key: string;
  label_en: string;
  label_es: string;
  value: string;
  delta: string;
  delta_direction: DeltaDirection;
}
interface ListingCount {
  key: string;
  label_en: string;
  label_es: string;
  value: string;
  delta: string;
  delta_direction: DeltaDirection;
}
interface PriceBand {
  key: string;
  label_en: string;
  label_es: string;
  value: string;
  delta: string;
  delta_direction: DeltaDirection;
}

export interface ExtractedRealtylineReport {
  month_label?: string;
  released_at?: string;
  subtitle_en?: string;
  headline_value?: string;
  headline_delta?: string;
  headline_delta_direction?: DeltaDirection;
  headline_label_en?: string;
  indicator_stats?: Partial<IndicatorStat>[];
  listing_counts?: Partial<ListingCount>[];
  price_bands?: Partial<PriceBand>[];
}

export type RealtylineExtractResult =
  | { ok: true; data: ExtractedRealtylineReport }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout'; detail?: string };

const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are reading the "Sales" block of the ABoR / UnlockMLS monthly market
stats page (https://unlockmls.com/stats). Ignore the "Leases" block entirely.

Return ONLY valid JSON matching this exact shape (fields may be omitted if
not visible):

{
  "month_label": "June 2026",
  "released_at": "2026-07-01",
  "headline_value": "$1.81B",
  "headline_delta": "5.9%",
  "headline_delta_direction": "up",
  "headline_label_en": "Sales dollar volume - single family - YoY",
  "indicator_stats": [
    { "key": "median_sales_price",  "label_en": "Median Sales Price",          "value": "$450,000", "delta": "1.1%",  "delta_direction": "up"   },
    { "key": "months_of_inventory", "label_en": "Months of Inventory",         "value": "4.4",      "delta": "1.0",   "delta_direction": "down" },
    { "key": "avg_days_on_market",  "label_en": "Average Days on Market",      "value": "62",       "delta": "0",     "delta_direction": "flat" },
    { "key": "avg_close_to_list",   "label_en": "Average Close to List Price", "value": "93.9%",    "delta": "93.7%", "delta_direction": "up"   }
  ],
  "listing_counts": [
    { "key": "closed_sales",    "label_en": "Closed Sales",    "value": "2,961",  "delta": "<1%",   "delta_direction": "up"   },
    { "key": "new_listings",    "label_en": "New Listings",    "value": "4,712",  "delta": "1.8%",  "delta_direction": "up"   },
    { "key": "active_listings", "label_en": "Active Listings", "value": "13,245", "delta": "14.8%", "delta_direction": "down" },
    { "key": "pending_sales",   "label_en": "Pending Sales",   "value": "2,994",  "delta": "13.2%", "delta_direction": "up"   }
  ],
  "price_bands": []
}

Rules:
- Headline: use "Sales Dollar Volume" from the Sales block. Convert "$1.81 BILLION" to "$1.81B". Direction from the arrow icon.
- Month label: use the "<Month YYYY> Sales" heading (drop "Sales") -> "June 2026".
- released_at: 1st of the month AFTER month_label (June 2026 -> 2026-07-01).
- Skip leases entirely.
- price_bands: return an empty array.
- Return valid JSON only. No prose. No code fences.
`;

export async function extractFromRealtylineGraphic({
  imageBase64,
  mimeType,
}: {
  imageBase64: string;
  mimeType: string;
}): Promise<RealtylineExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'GEMINI_API_KEY not set' };

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: 'Extract the RealtyLine (Sales block only) fields from this graphic. Return the JSON object described.' },
        ],
      },
    ],
    generation_config: {
      temperature: 0.0,
      response_mime_type: 'application/json',
      max_output_tokens: 4096,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted')) return { ok: false, reason: 'timeout', detail: `> ${TIMEOUT_MS}ms` };
    return { ok: false, reason: 'http-error', detail: msg };
  }
  clearTimeout(timer);

  if (res.status === 429) return { ok: false, reason: 'rate-limit', detail: 'Gemini 429' };
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger?.warn?.(`[realtyline-extract] gemini non-2xx status=${res.status} detail=${detail.slice(0, 300)}`);
    return { ok: false, reason: 'http-error', detail: `status ${res.status}: ${detail.slice(0, 300)}` };
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    return { ok: false, reason: 'parse-error', detail: err instanceof Error ? err.message : 'json parse' };
  }

  const text = extractText(payload);
  if (!text) return { ok: false, reason: 'parse-error', detail: 'empty candidates' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'parse-error', detail: `not JSON: ${text.slice(0, 200)}` };
  }

  return { ok: true, data: normalize(parsed) };
}

function extractText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidates = Array.isArray(p.candidates) ? p.candidates : [];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const content = (c as Record<string, unknown>).content;
    if (!content || typeof content !== 'object') continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return (part as Record<string, string>).text;
      }
    }
  }
  return null;
}

function isDir(v: unknown): v is DeltaDirection {
  return v === 'up' || v === 'down' || v === 'flat';
}

function normalize(raw: unknown): ExtractedRealtylineReport {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ExtractedRealtylineReport = {};

  if (typeof r.month_label === 'string') out.month_label = r.month_label;
  if (typeof r.released_at === 'string') out.released_at = r.released_at;
  if (typeof r.subtitle_en === 'string') out.subtitle_en = r.subtitle_en;
  if (typeof r.headline_value === 'string') out.headline_value = r.headline_value;
  if (typeof r.headline_delta === 'string') out.headline_delta = r.headline_delta;
  if (isDir(r.headline_delta_direction)) out.headline_delta_direction = r.headline_delta_direction;
  if (typeof r.headline_label_en === 'string') out.headline_label_en = r.headline_label_en;
  if (Array.isArray(r.indicator_stats)) out.indicator_stats = r.indicator_stats as Partial<IndicatorStat>[];
  if (Array.isArray(r.listing_counts)) out.listing_counts = r.listing_counts as Partial<ListingCount>[];
  if (Array.isArray(r.price_bands)) out.price_bands = r.price_bands as Partial<PriceBand>[];

  return out;
}
