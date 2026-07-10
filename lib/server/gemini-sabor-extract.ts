/**
 * Gemini-powered SABOR MLS infographic extractor.
 *
 * Used by /api/admin/sabor-mls/import-graphic to autopopulate the
 * SABOR report editor from an uploaded monthly Market Stats graphic
 * (PDF or raster image).
 *
 * Returns the extracted payload as a Partial<SaborReport> keyed to the
 * canonical preset shape, so the client can spread it into the form
 * state and only fields the model was confident about are replaced.
 *
 * Never throws — every failure mode returns an error sentinel.
 */

import { logger } from './logger';
import {
  INDICATOR_PRESETS,
  LISTING_COUNT_PRESETS,
  PRICE_BAND_PRESETS,
  type DeltaDirection,
  type IndicatorStat,
  type ListingCount,
  type PriceBand,
} from '@/lib/sabor-mls';

// Public shape returned to the caller. Every field is optional so the
// UI can merge whatever the model produced without clobbering unedited
// state.
export interface ExtractedSaborReport {
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

export type SaborExtractResult =
  | { ok: true; data: ExtractedSaborReport }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout'; detail?: string };

const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Vision + PDF calls are slower than text — 45s ceiling.
const TIMEOUT_MS = 45_000;

const INDICATOR_KEYS = INDICATOR_PRESETS.map((p) => p.key);
const LISTING_KEYS = LISTING_COUNT_PRESETS.map((p) => p.key);
const PRICE_BAND_KEYS = PRICE_BAND_PRESETS.map((p) => p.key);

const SYSTEM_PROMPT = `You are an information-extraction service. The user will upload a SABOR (San Antonio Board of REALTORS) monthly Market Stats infographic — either as a raster image (PNG/JPEG/WEBP) or as a PDF.

Your job: extract the report's fields as structured JSON so an editor can review and save it.

Return ONLY a JSON object — no surrounding prose, no code fences, no markdown.

Schema:
{
  "month_label": string | null,              // "May 2026", "June 2026", etc.
  "released_at": string | null,              // ISO date if a "Released" or publication date is shown, else null
  "subtitle_en": string | null,              // The full subtitle / disclaimer paragraph shown on the front cover, if any
  "headline_value": string | null,           // The BIG headline number, e.g. "$1.16B" or "$1,160,000,000"
  "headline_delta": string | null,           // The YoY percentage shown next to the headline, without arrow glyph, e.g. "4%"
  "headline_delta_direction": "up" | "down" | "flat" | null,
  "headline_label_en": string | null,        // The caption under the headline, e.g. "Closed dollar volume · single family · YoY"
  "indicator_stats": [
    { "key": string, "value": string, "delta": string | null, "delta_direction": "up"|"down"|"flat"|null }
    // one entry per stat you find; use the canonical key from the list below
  ],
  "listing_counts": [
    { "key": string, "value": string, "delta": string | null, "delta_direction": "up"|"down"|"flat"|null }
  ],
  "price_bands": [
    { "key": string, "share": string }        // share as it appears, e.g. "66.30%"
  ]
}

Canonical indicator_stats keys (use EXACTLY these):
  - "days_on_market"           — "Days on Market" or "DOM"
  - "price_per_sqft"           — "Price per Square Foot" / "Price/SqFt"
  - "close_to_list_price"      — "Close to Original List Price" / "Close-to-List"
  - "months_of_inventory"      — "Months of Inventory" / "MOI"
  - "avg_residential_rental"   — "Average Residential Rental"
  - "total_sales"              — "Total Sales"
  - "average_price"            — "Average Price"
  - "median_price"             — "Median Price"

Canonical listing_counts keys:
  - "new_listings"                    — "New Listings"
  - "active_listings"                 — "Active Listings"
  - "pending_listings"                — "Pending Listings"
  - "active_residential_rental_list"  — "Active Residential Rental Listings"

Canonical price_bands keys:
  - "band_0_199"       — "$0 - $199,999"
  - "band_200_499"     — "$200,000 - $499,999"
  - "band_500_749"     — "$500,000 - $749,999"
  - "band_750_plus"    — "$750,000 - 1M+"  or "$750,000+"

Rules:
- Copy values VERBATIM as shown on the graphic — don't strip $ signs, commas, or % symbols. E.g. "$306,000" stays "$306,000"; "83" stays "83"; "66.30%" stays "66.30%".
- Delta percentages: strip only the arrow/triangle glyph. "▲15%" becomes "15%".
- Direction: infer from arrow direction or explicit "+"/"-" sign. Green/up arrow = "up", red/down arrow = "down", horizontal or no arrow = "flat".
- If a field is not visible or unclear, use null (or omit entries from the arrays). NEVER guess.
- For arrays, only include entries for stats you can actually see on the graphic. If the graphic has 8 indicator stats but you only see 6 clearly, return 6 entries — don't pad.
- If the graphic is multi-page (PDF), scan every page and merge the data.`;

interface CallArgs {
  imageBase64: string;
  mimeType: string;
}

export async function extractFromSaborGraphic({
  imageBase64,
  mimeType,
}: CallArgs): Promise<SaborExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'GEMINI_API_KEY not set' };

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: 'Extract the SABOR report fields from this graphic. Return the JSON object described in the schema.' },
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
    logger?.warn?.(`[sabor-extract] gemini non-2xx status=${res.status} detail=${detail.slice(0, 300)}`);
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

  const data = normalize(parsed);
  return { ok: true, data };
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

function normalize(raw: unknown): ExtractedSaborReport {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: ExtractedSaborReport = {};

  if (typeof r.month_label === 'string') out.month_label = r.month_label.trim();
  if (typeof r.released_at === 'string') out.released_at = r.released_at.trim();
  if (typeof r.subtitle_en === 'string') out.subtitle_en = r.subtitle_en.trim();
  if (typeof r.headline_value === 'string') out.headline_value = r.headline_value.trim();
  if (typeof r.headline_delta === 'string') out.headline_delta = r.headline_delta.trim();
  if (isDir(r.headline_delta_direction)) out.headline_delta_direction = r.headline_delta_direction;
  if (typeof r.headline_label_en === 'string') out.headline_label_en = r.headline_label_en.trim();

  if (Array.isArray(r.indicator_stats)) {
    out.indicator_stats = r.indicator_stats
      .map(normalizeStat)
      .filter((s): s is Partial<IndicatorStat> => !!s && INDICATOR_KEYS.includes(String(s.key)));
  }
  if (Array.isArray(r.listing_counts)) {
    out.listing_counts = r.listing_counts
      .map(normalizeStat)
      .filter((s): s is Partial<ListingCount> => !!s && LISTING_KEYS.includes(String(s.key)));
  }
  if (Array.isArray(r.price_bands)) {
    out.price_bands = r.price_bands
      .map(normalizeBand)
      .filter((b): b is Partial<PriceBand> => !!b && PRICE_BAND_KEYS.includes(String(b.key)));
  }
  return out;
}

function normalizeStat(m: unknown): Partial<IndicatorStat> | null {
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  const out: Partial<IndicatorStat> = {};
  if (typeof r.key === 'string') out.key = r.key.trim();
  if (typeof r.value === 'string') out.value = r.value.trim();
  if (typeof r.delta === 'string') out.delta = r.delta.trim();
  if (isDir(r.delta_direction)) out.delta_direction = r.delta_direction;
  return out.key ? out : null;
}

function normalizeBand(m: unknown): Partial<PriceBand> | null {
  if (!m || typeof m !== 'object') return null;
  const r = m as Record<string, unknown>;
  const out: Partial<PriceBand> = {};
  if (typeof r.key === 'string') out.key = r.key.trim();
  if (typeof r.share === 'string') out.share = r.share.trim();
  return out.key ? out : null;
}
