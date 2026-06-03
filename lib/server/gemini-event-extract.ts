/**
 * Gemini-powered event extractor.
 *
 * Given the caption + posted_at of a Facebook Page post, asks Gemini 1.5
 * Flash whether the post is announcing an event and if so extracts
 * { title, start_date, end_date, location, organizer, confidence }.
 *
 * Gemini Flash on Google's free tier:
 *   - 15 requests/minute, 1500 requests/day
 *   - Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   - Auth: ?key={GEMINI_API_KEY}
 *
 * If GEMINI_API_KEY is not configured, the extractor returns
 * { ok: false, reason: 'no-key' } and the caller skips the scan.
 *
 * Cron design (in /api/cron/scan-fb-events) ensures we never exceed the
 * free tier: typically <50 new posts/day on the RealtyLine page.
 */

import { logger } from './logger';

export interface ExtractedEvent {
  isEvent: true;
  title: string;
  startDate: string | null; // ISO 8601
  endDate: string | null;
  location: string | null;
  organizer: string | null;
  confidence: number; // 0..1
}

export type ExtractResult =
  | ExtractedEvent
  | { isEvent: false; confidence: number }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error'; detail?: string };

// gemini-1.5-flash-latest tracks the most recent stable Flash model.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash-latest';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// 6 s per request — Flash is fast, anything longer is almost certainly
// a network hang. The cron wraps this in Promise.allSettled so one slow
// post doesn't block the others.
const TIMEOUT_MS = 6_000;

const SYSTEM_PROMPT = `You are an information extraction service that decides whether a Facebook post is announcing an event, and if so extracts the event metadata.

You will be given:
  - The post's caption (member-generated text)
  - The date the post was published (in ISO 8601 UTC)

Return ONLY a JSON object with NO surrounding prose, NO code fences, NO markdown — just raw JSON.

Schema when an event is detected:
{
  "isEvent": true,
  "title": string,                    // concise event title, max 200 chars
  "startDate": string | null,         // ISO 8601, derived using the post date as context for "this Saturday" etc. Return null if no date/time can be inferred.
  "endDate": string | null,           // ISO 8601 or null if open-ended/unstated
  "location": string | null,          // address, venue name, or city. null if not stated.
  "organizer": string | null,         // name of host org/brokerage/agent if mentioned. null otherwise.
  "confidence": number                // 0..1, how confident you are this is a real, specific, scheduled event
}

Schema when NOT an event:
{
  "isEvent": false,
  "confidence": number                // 0..1, how confident you are this is NOT an event
}

Rules:
- "Event" means a scheduled, time-bound gathering: open houses, CE classes, networking mixers, ribbon cuttings, charity drives with a date, awards ceremonies, etc.
- NOT events: general announcements, market updates, generic motivational posts, listings without an open house, congratulations, memorials, recurring weekly things without a specific instance, "we're hiring", "happy birthday".
- If a post is ambiguous, lean toward isEvent: false with a moderate confidence (0.4-0.6).
- For relative dates ("this Saturday", "tomorrow", "next Thursday"), resolve using the post-published date as the anchor. Resolve to the upcoming occurrence; if ambiguous, pick the soonest future date.
- If no time is given but a date is, use 09:00 local US/Central as a placeholder for startDate and leave endDate null.
- If only a time range is given (e.g. "2-4pm") and the date is implied as same-day-of-post, use the post date.
`;

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

/**
 * Strip code fences / chatty prose around a JSON object. Gemini Flash
 * generally returns clean JSON when system-prompted, but occasionally
 * wraps it in \`\`\`json … \`\`\` despite the explicit instruction.
 */
function extractJsonBlob(raw: string): string | null {
  const trimmed = raw.trim();
  // Strip a leading ```json or ``` and trailing ```
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();

  // Find first '{' and matching last '}'. This is sloppy but works for
  // single-object responses (the only shape we ask Gemini for).
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) return null;
  return trimmed.slice(first, last + 1);
}

/**
 * Validate + narrow a parsed JSON blob to a known ExtractResult shape.
 * Anything malformed → null so the caller can skip.
 */
function coerceResult(raw: unknown): ExtractResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const isEvent = obj.isEvent === true;
  const confidence =
    typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0.5;

  if (!isEvent) {
    return { isEvent: false, confidence };
  }

  const title =
    typeof obj.title === 'string' ? obj.title.trim().slice(0, 500) : '';
  if (!title) return null; // can't be a real event without a title

  return {
    isEvent: true,
    title,
    startDate:
      typeof obj.startDate === 'string' && obj.startDate.trim()
        ? obj.startDate.trim()
        : null,
    endDate:
      typeof obj.endDate === 'string' && obj.endDate.trim()
        ? obj.endDate.trim()
        : null,
    location:
      typeof obj.location === 'string' && obj.location.trim()
        ? obj.location.trim().slice(0, 500)
        : null,
    organizer:
      typeof obj.organizer === 'string' && obj.organizer.trim()
        ? obj.organizer.trim().slice(0, 500)
        : null,
    confidence,
  };
}

/**
 * Call Gemini Flash with one post's caption. Returns a structured result
 * or an error sentinel. Never throws — callers handle the union.
 */
export async function extractEventFromPost(args: {
  caption: string;
  postedAt: string | null; // ISO date the post was published
}): Promise<ExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };

  const userText =
    `Post published at: ${args.postedAt ?? '(unknown)'}\n\n` +
    `Caption:\n${args.caption}`;

  const body = {
    // Gemini's REST API quirk: system_instruction is a top-level field,
    // not a "role: system" message.
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.1, // deterministic-ish for extraction
      maxOutputTokens: 400,
      // Force JSON-mode so the model returns valid JSON (Gemini Flash
      // supports response_mime_type as of 1.5).
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
      '[gemini-event-extract] non-2xx',
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

  // Gemini response shape:
  // { candidates: [{ content: { parts: [{ text: "..." }] } }] }
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

  const jsonBlob = extractJsonBlob(text);
  if (!jsonBlob) return { ok: false, reason: 'parse-error', detail: 'no json blob' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlob);
  } catch (err) {
    return {
      ok: false,
      reason: 'parse-error',
      detail: err instanceof Error ? err.message : 'bad json',
    };
  }

  const coerced = coerceResult(parsed);
  if (!coerced) return { ok: false, reason: 'parse-error', detail: 'bad shape' };
  return coerced;
}
