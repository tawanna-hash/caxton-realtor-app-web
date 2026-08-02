/**
 * Gemini-powered event extractor for plain-text email bodies.
 *
 * Used by lib/server/gmail-event-scanner.ts to turn an association or
 * advertiser email into 0..N candidate calendar events.
 *
 * Mirrors gemini-sabor-extract.ts: raw fetch to Google's generativelanguage
 * REST API, no SDK dependency. Never throws — every failure mode returns an
 * error sentinel so one bad message can't abort a whole scan.
 */

import { logger } from './logger';

export interface ExtractedEmailEvent {
  name: string;
  /** Whatever the email said, verbatim — parsed downstream, may be unparseable. */
  date: string | null;
  time: string | null;
  location: string | null;
  host: string | null;
  rsvpUrl: string | null;
  notes: string | null;
  confidence: number;
}

export type EmailEventsExtractResult =
  | { ok: true; isEvent: boolean; events: ExtractedEmailEvent[] }
  | {
      ok: false;
      reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout';
      detail?: string;
    };

const MODEL = process.env.GEMINI_TEXT_MODEL ?? process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Text-only calls are much faster than the vision extractors — 30s is plenty
// and keeps a 300s cron from stalling on a handful of slow messages.
const TIMEOUT_MS = 30_000;

// Newsletters can be enormous. The event details are essentially always near
// the top, and truncating bounds both latency and token spend.
const MAX_BODY_CHARS = 12_000;

const SYSTEM_PROMPT = `You are an information-extraction service reading email sent to a real estate trade publication in Texas. The publisher wants to list genuine industry events on a public calendar.

Your job: decide whether the email announces one or more real, hosted events, and if so extract them as structured JSON.

Return ONLY a JSON object — no surrounding prose, no code fences, no markdown.

Schema:
{
  "is_event": boolean,
  "events": [
    {
      "name": string,               // The event's name/title
      "date": string | null,        // The date EXACTLY as written, e.g. "Thursday, March 12, 2026" or "3/12"
      "time": string | null,        // The time EXACTLY as written, e.g. "11:30 AM - 1:00 PM"
      "location": string | null,    // Venue and/or street address as written
      "host": string | null,        // The hosting organization or chapter
      "rsvp_url": string | null,    // Registration / RSVP / ticket link if one is given
      "notes": string | null,       // One or two sentences of extra detail worth showing on a calendar
      "confidence": number          // 0.0-1.0, your confidence this is a real event with a real date
    }
  ]
}

What COUNTS as an event:
- A hosted gathering with a concrete date: luncheons, installations, galas, mixers, CE classes, expos, board meetings, golf tournaments, ribbon cuttings, grand openings, award ceremonies, charity drives with an event date.

What does NOT count (return {"is_event": false, "events": []}):
- Marketing blasts, product pitches, sponsorship solicitations with no event.
- Newsletters and market-stat roundups that merely recap news.
- Receipts, invoices, payment confirmations, password resets, automated notices.
- Membership renewal reminders and dues notices.
- Job postings, listing announcements, open house blasts for a single property.
- Anything with no identifiable date, or only a vague one ("this fall", "coming soon").

Rules:
- Copy date, time, and location strings VERBATIM from the email. Do NOT normalize, reformat, or convert them — a downstream parser handles that and needs the original text.
- If the email announces several distinct events (a calendar digest), return one entry per event.
- Set confidence below 0.5 when the date is ambiguous, the "event" might be promotional, or key details are missing. NEVER invent a date, venue, or host that is not in the email.
- If nothing qualifies, return {"is_event": false, "events": []}. An empty result is a correct answer and is strongly preferred over a guess.`;

export async function extractEventsFromEmail(input: {
  subject: string;
  from: string;
  receivedAt: string | null;
  body: string;
}): Promise<EmailEventsExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'GEMINI_API_KEY not set' };

  const body = input.body.slice(0, MAX_BODY_CHARS);
  const userText = [
    `From: ${input.from}`,
    `Subject: ${input.subject}`,
    input.receivedAt ? `Received: ${input.receivedAt}` : null,
    '',
    body,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const payloadBody = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generation_config: {
      temperature: 0.0,
      response_mime_type: 'application/json',
      max_output_tokens: 2048,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody),
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
    logger.warn(
      `[email-events-extract] gemini non-2xx status=${res.status} detail=${detail.slice(0, 300)}`,
    );
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

  return normalize(parsed);
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

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function normalize(raw: unknown): EmailEventsExtractResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'parse-error', detail: 'not an object' };
  }
  const r = raw as Record<string, unknown>;
  const isEvent = r.is_event === true;
  const rawEvents = Array.isArray(r.events) ? r.events : [];

  const events: ExtractedEmailEvent[] = [];
  for (const e of rawEvents) {
    if (!e || typeof e !== 'object') continue;
    const rec = e as Record<string, unknown>;
    const name = str(rec.name);
    // A nameless candidate has nothing to show in the review queue.
    if (!name) continue;
    const confidence = typeof rec.confidence === 'number' && Number.isFinite(rec.confidence)
      ? Math.min(1, Math.max(0, rec.confidence))
      : 0.5;
    events.push({
      name,
      date: str(rec.date),
      time: str(rec.time),
      location: str(rec.location),
      host: str(rec.host),
      rsvpUrl: str(rec.rsvp_url),
      notes: str(rec.notes),
      confidence,
    });
  }

  return { ok: true, isEvent: isEvent && events.length > 0, events };
}
