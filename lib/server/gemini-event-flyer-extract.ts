/**
 * Gemini-powered event flyer extractor.
 *
 * Used by /api/admin/events/extract-flyer to autopopulate the New/Edit
 * Event admin form from an uploaded flyer image (association CE classes,
 * mixers, luncheons, expos, etc. — see docs/GMAIL_EVENT_SCANNER.md for the
 * sibling email-based extractor this mirrors).
 *
 * Returns a Partial<ExtractedEventFlyer> so the client can spread only the
 * fields the model was confident about into the form, without clobbering
 * anything the admin already typed.
 *
 * Never throws — every failure mode returns an error sentinel.
 */

import { logger } from './logger';

export interface ExtractedEventFlyer {
  title: string | null;
  description: string | null;
  /** Whatever the flyer said, verbatim — parsed downstream by the client. */
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  organizer: string | null;
  organizerEmail: string | null;
  website: string | null;
  format: string | null;
  courseNumber: string | null;
  memberPrice: string | null;
  nonmemberPrice: string | null;
  instructorName: string | null;
  instructorBio: string | null;
  confidence: number;
}

export type EventFlyerExtractResult =
  | { ok: true; data: ExtractedEventFlyer }
  | {
      ok: false;
      reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout';
      detail?: string;
    };

const MODEL = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const TIMEOUT_MS = 45_000;

const SYSTEM_PROMPT = `You are an information-extraction service reading a flyer or graphic advertising a real estate industry event in Texas (CE class, luncheon, mixer, expo, installation, gala, board meeting, golf tournament, etc.). The publisher wants to turn this flyer into a public calendar listing.

Return ONLY a JSON object — no surrounding prose, no code fences, no markdown.

Schema:
{
  "title": string | null,              // The event's name/title, e.g. "Broker Responsibility"
  "description": string | null,        // A short 1-3 sentence summary of what the event covers, built from the flyer's body copy / bullet points
  "date": string | null,               // The date EXACTLY as written, e.g. "October 19, 2026" or "Monday, October 19, 2026"
  "start_time": string | null,         // Start time exactly as written, e.g. "9:00 AM"
  "end_time": string | null,           // End time exactly as written, e.g. "3:00 PM"
  "location": string | null,           // Venue name AND street address if both shown, e.g. "SouthStar Bank - Leander, 10737 E Crystal Falls Pkwy, Leander, TX 78641"
  "organizer": string | null,          // The hosting company/organization, e.g. "Stewart Title" or "SABOR"
  "organizer_email": string | null,    // A contact email if one is shown (host, event partner, or RSVP contact)
  "website": string | null,            // A registration URL or website if shown (may be absent if it's only a QR code)
  "format": string | null,             // "In-Person" or "Virtual"/"Online" if determinable, else null
  "course_number": string | null,      // A CE/course number if shown, e.g. "50498" (digits only, no "Course #" prefix)
  "member_price": string | null,       // Price for members/attendees if shown, e.g. "Free" or "$25"
  "nonmember_price": string | null,    // Price for non-members if a separate price is shown, else null
  "instructor_name": string | null,    // The named instructor/speaker, if the flyer labels someone as instructor/speaker/presenter
  "instructor_bio": string | null,     // Instructor's title + company if shown, e.g. "TREC Commissioner & Broker, CB&A Realtors"
  "confidence": number                 // 0.0-1.0, your confidence this is a real event with a real date
}

Rules:
- Copy date, time, and location strings VERBATIM from the flyer. Do NOT normalize, reformat, or convert them — a downstream parser handles that and needs the original text.
- If the flyer lists multiple hosts/partners without a clear single "instructor" or "speaker" label, leave instructor_name null rather than guessing which name is the instructor.
- If a field is not visible or not stated, use null. NEVER invent a date, venue, price, or contact that is not on the flyer.
- Set confidence below 0.5 when the date is ambiguous, illegible, or missing.
- If the image is not actually an event flyer (e.g. it's a listing photo, a logo, an unrelated graphic), return {"title": null, "confidence": 0} for every field.`;

interface CallArgs {
  imageBase64: string;
  mimeType: string;
}

export async function extractFromEventFlyer({
  imageBase64,
  mimeType,
}: CallArgs): Promise<EventFlyerExtractResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key', detail: 'GEMINI_API_KEY not set' };

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
          { text: 'Extract the event fields from this flyer. Return the JSON object described in the schema.' },
        ],
      },
    ],
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
    logger?.warn?.(`[event-flyer-extract] gemini non-2xx status=${res.status} detail=${detail.slice(0, 300)}`);
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
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function normalize(parsed: unknown): ExtractedEventFlyer {
  const p = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const confidence = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0;
  return {
    title: str(p.title),
    description: str(p.description),
    date: str(p.date),
    startTime: str(p.start_time),
    endTime: str(p.end_time),
    location: str(p.location),
    organizer: str(p.organizer),
    organizerEmail: str(p.organizer_email),
    website: str(p.website),
    format: str(p.format),
    courseNumber: str(p.course_number),
    memberPrice: str(p.member_price),
    nonmemberPrice: str(p.nonmember_price),
    instructorName: str(p.instructor_name),
    instructorBio: str(p.instructor_bio),
    confidence,
  };
}
