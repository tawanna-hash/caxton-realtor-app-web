/**
 * Gemini-powered "team page" screenshot extractor.
 *
 * Used by the CRM drawer's "Import from screenshot" affordance: an admin
 * pastes / uploads a screenshot of a brokerage or title-company team
 * page and we extract the office locations and staff cards into
 * structured rows so they can be bulk-created in
 * `advertiser_locations` + `advertiser_staff`.
 *
 * Gemini 1.5 Flash supports inline image input (base64) and JSON-mode
 * output, so a single call is enough — no OCR step required.
 *
 * Returns either the extracted payload or an error sentinel; never
 * throws.
 */

import { logger } from './logger';

export interface ExtractedLocation {
  label: string | null;
  address: string | null;
  address_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  hours: string | null;
  is_primary: boolean;
}

export interface ExtractedStaffMember {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  /** 1-based index into the locations[] array, or null if not clearly tied. */
  location_index: number | null;
}

interface ExtractedScreenshot {
  locations: ExtractedLocation[];
  staff: ExtractedStaffMember[];
}

export type ScreenshotExtractResult =
  | { ok: true; data: ExtractedScreenshot }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error'; detail?: string };

// Gemini 1.5 Flash was retired in May 2025. Use Gemini 2.5 Flash --
// the current GA stable Flash model that supports image (vision) input.
// Override via GEMINI_VISION_MODEL if a newer model becomes available.
const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Vision calls are slower than text — 30s ceiling.
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are an information-extraction service. The user will paste a screenshot of a real-estate brokerage, title company, mortgage company, or similar business — typically a "team" / "our people" / "find a location" page.

Your job: extract every office location and every staff member visible in the image as structured JSON.

Return ONLY a JSON object — no surrounding prose, no code fences, no markdown.

Schema:
{
  "locations": [
    {
      "label": string | null,        // e.g. "North Mopac", "Hartland Plaza" — the office's short name if shown
      "address": string | null,      // street + number, e.g. "Stonebridge Plaza II, 9600 North Mopac Expy"
      "address_2": string | null,    // suite / floor, e.g. "Suite 125"
      "city": string | null,
      "state": string | null,        // 2-letter abbreviation when possible, e.g. "TX"
      "zip": string | null,
      "phone": string | null,        // digits only or formatted; we'll normalize
      "email": string | null,
      "hours": string | null,        // free text like "Mon-Fri 9am-5pm" if shown, else null
      "is_primary": boolean          // true for ONLY ONE office — the one most prominently featured / labeled "HQ" / "Main"; if unclear, mark the first as primary
    }
  ],
  "staff": [
    {
      "name": string,                // full name; required — skip cards with no name
      "title": string | null,        // e.g. "Escrow Officer", "VP / Escrow Officer"
      "email": string | null,
      "phone": string | null,
      "photo_url": string | null,    // ALWAYS null — you can't reliably extract URLs from an image
      "location_index": number | null // 1-based index into the locations[] array above if the staff card is clearly grouped under a location section; otherwise null
    }
  ]
}

Rules:
- Extract EVERY staff card visible, even partially. Use the most prominent name shown.
- Titles often appear in small caps below the name — capture them as-is.
- Phones may appear with dots ("512.459.7222") or dashes — copy them verbatim, normalization happens downstream.
- Emails are often shown in ALL CAPS — preserve as shown (downstream will lowercase).
- If a single phone/email is shared by all staff at one location, copy it onto each staff card so the data is self-contained.
- If the image shows multiple location sections (e.g. tabs labeled "NORTH MOPAC", "HARTLAND PLAZA"), create one location row per tab, and use location_index to bind each visible staff card to the section it appears under.
- If only ONE location is shown in the screenshot, that location is primary.
- If you cannot tell where a staff member belongs, set location_index to null.
- Do NOT invent data. Use null for any field you can't read.
- Do NOT include photo_url — always null.
- The image may have been resized; favor accuracy over completeness for fields you can't clearly read.`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function extractJsonBlob(raw: string): string | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  return trimmed.slice(first, last + 1);
}

function toStr(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, 500);
}

function coerce(raw: unknown): ExtractedScreenshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const rawLocations = Array.isArray(obj.locations) ? obj.locations : [];
  const rawStaff = Array.isArray(obj.staff) ? obj.staff : [];

  const locations: ExtractedLocation[] = rawLocations
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((l) => ({
      label: toStr(l.label),
      address: toStr(l.address),
      address_2: toStr(l.address_2),
      city: toStr(l.city),
      state: toStr(l.state),
      zip: toStr(l.zip),
      phone: toStr(l.phone),
      email: toStr(l.email),
      hours: toStr(l.hours),
      is_primary: !!l.is_primary,
    }));

  const staff: ExtractedStaffMember[] = rawStaff
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((s) => {
      const name = toStr(s.name) ?? '';
      if (!name) return null;
      const idxRaw = s.location_index;
      const location_index =
        typeof idxRaw === 'number' && Number.isInteger(idxRaw) && idxRaw >= 1
          ? idxRaw
          : null;
      return {
        name,
        title: toStr(s.title),
        email: toStr(s.email),
        phone: toStr(s.phone),
        photo_url: toStr(s.photo_url),
        location_index,
      } as ExtractedStaffMember;
    })
    .filter((x): x is ExtractedStaffMember => x !== null);

  return { locations, staff };
}

/**
 * Call Gemini with a screenshot. The image must be passed as a base64
 * string + its IANA mime type (e.g. "image/png", "image/jpeg").
 */
export async function extractFromScreenshot(args: {
  imageBase64: string;
  mimeType: string;
}): Promise<ScreenshotExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Extract every office location and every staff member from this screenshot. Return ONLY the JSON object described in the system instructions.' },
          {
            inline_data: {
              mime_type: args.mimeType,
              data: args.imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4_000,
      response_mime_type: 'application/json',
    },
  };

  let res: Response;
  try {
    res = await withTimeout(
      fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      TIMEOUT_MS,
    );
  } catch (err) {
    return {
      ok: false,
      reason: 'http-error',
      detail: err instanceof Error ? err.message : 'fetch failed',
    };
  }

  if (res.status === 429) return { ok: false, reason: 'rate-limit' };
  if (!res.ok) {
    const detail = await res.text().catch(() => '(no body)');
    logger.warn(
      { status: res.status, detail: detail.slice(0, 400) },
      '[gemini-screenshot-extract] non-2xx',
    );
    return { ok: false, reason: 'http-error', detail: `${res.status}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      detail: err instanceof Error ? err.message : 'json parse',
    };
  }

  const text =
    ((json as Record<string, unknown>)?.candidates as unknown[] | undefined)
      ?.map((c) => {
        const parts =
          ((c as Record<string, unknown>)?.content as Record<string, unknown>)
            ?.parts as unknown[] | undefined;
        return parts
          ?.map((p) => (p as Record<string, unknown>)?.text)
          .filter((t): t is string => typeof t === 'string')
          .join('');
      })
      .filter((t): t is string => typeof t === 'string')
      .join('\n') ?? '';

  if (!text) return { ok: false, reason: 'parse-error', detail: 'no text' };

  const blob = extractJsonBlob(text);
  if (!blob) return { ok: false, reason: 'parse-error', detail: 'no json blob' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      detail: err instanceof Error ? err.message : 'bad json',
    };
  }

  const coerced = coerce(parsed);
  if (!coerced) return { ok: false, reason: 'parse-error', detail: 'bad shape' };
  return { ok: true, data: coerced };
}
