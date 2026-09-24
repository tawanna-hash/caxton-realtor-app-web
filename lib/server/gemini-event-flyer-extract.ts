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
import type { EventScheduleItem, EventSpeaker } from './events-store';

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
  schedule: EventScheduleItem[];
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
  "schedule": [                        // Ordered agenda entries, [] if no actual schedule is printed
    { "time": string, "title": string, "details": string }
  ],                                   // time as printed (e.g. "8:30–9:10 AM"), title = session/break/lunch name, details = speaker/moderator/panelists as printed or ""
  "confidence": number                 // 0.0-1.0, your confidence this is a real event with a real date
}

Rules:
- Copy date, time, and location strings VERBATIM from the flyer. Do NOT normalize, reformat, or convert them — a downstream parser handles that and needs the original text.
- If the flyer lists multiple hosts/partners without a clear single "instructor" or "speaker" label, leave instructor_name null rather than guessing which name is the instructor.
- If a field is not visible or not stated, use null. NEVER invent a date, venue, price, or contact that is not on the flyer.
- Include only schedule entries visibly printed on the flyer, in their original order. Do not invent a breakdown from the event's overall start and end times. Keep speaker names and titles as written.
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

/** Read one agenda page. Kept separate from flyer extraction so no event metadata is changed. */
export async function extractEventSchedulePage({
  imageBase64,
  mimeType,
}: CallArgs): Promise<
  | { ok: true; schedule: EventScheduleItem[] }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout' }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `Read this SINGLE PAGE of an event agenda. Return only JSON:
{"schedule":[{"time":"printed time or range, or empty string","title":"session/activity title","details":"speakers, moderators, panelists and other printed session details, or empty string"}]}
Include every scheduled session, break, meal, and opening/closing item visible on this page, in printed order. Do not invent times or sessions. Do not turn the overall event time/date into a session. Do not add an event heading as a session. If a day/date heading is printed, prefix each entry's details with "Day: [printed heading]" so multi-day agendas remain clear. If a session continues across pages, include only what is actually visible on this page. Preserve proper names and acronyms. Return [] if no agenda entries are visible.` }],
        },
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: 'Extract the printed schedule entries on this page.' },
          ],
        }],
        generation_config: {
          temperature: 0,
          response_mime_type: 'application/json',
          max_output_tokens: 4096,
        },
      }),
    });
    if (response.status === 429) return { ok: false, reason: 'rate-limit' };
    if (!response.ok) {
      logger?.warn?.(`[event-schedule-extract] gemini status=${response.status}`);
      return { ok: false, reason: 'http-error' };
    }
    const text = extractText(await response.json());
    if (!text) return { ok: false, reason: 'parse-error' };
    const parsed = JSON.parse(text) as { schedule?: unknown };
    return { ok: true, schedule: normalize({ schedule: parsed.schedule }).schedule };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'parse-error' };
  } finally {
    clearTimeout(timer);
  }
}

/** Read named speakers from one uploaded page without modifying event metadata. */
export async function extractEventSpeakersPage({
  imageBase64,
  mimeType,
}: CallArgs): Promise<
  | { ok: true; speakers: EventSpeaker[] }
  | { ok: false; reason: 'no-key' | 'rate-limit' | 'parse-error' | 'http-error' | 'timeout' }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-key' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `Read this SINGLE PAGE of event speaker information. Return only JSON:
{"speakers":[{"name":"printed full name","title":"printed job title or empty string","company":"printed organization/company or empty string","bio":"printed biographical text or empty string"}]}
Include only people explicitly identified as speakers, presenters, panelists, moderators, or instructors. Do not treat an organizer, sponsor, venue, or session title as a speaker. Only include names and details visible on this page. Do not invent missing titles, companies, or biographies. Preserve proper names and acronyms. If a bio continues across pages, include only the portion printed on this page. Return [] when no named speakers are visible.` }],
        },
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: 'Extract the named event speakers and their printed details on this page.' },
          ],
        }],
        generation_config: {
          temperature: 0,
          response_mime_type: 'application/json',
          max_output_tokens: 4096,
        },
      }),
    });
    if (response.status === 429) return { ok: false, reason: 'rate-limit' };
    if (!response.ok) {
      logger?.warn?.(`[event-speaker-extract] gemini status=${response.status}`);
      return { ok: false, reason: 'http-error' };
    }
    const text = extractText(await response.json());
    if (!text) return { ok: false, reason: 'parse-error' };
    const parsed = JSON.parse(text) as { speakers?: unknown };
    if (!Array.isArray(parsed.speakers)) return { ok: false, reason: 'parse-error' };
    const speakers: EventSpeaker[] = parsed.speakers
      .filter((person): person is Record<string, unknown> => !!person && typeof person === 'object')
      .map((person) => ({
        name: typeof person.name === 'string' ? person.name.trim().slice(0, 200) : '',
        title: typeof person.title === 'string' ? person.title.trim().slice(0, 300) : '',
        company: typeof person.company === 'string' ? person.company.trim().slice(0, 300) : '',
        bio: typeof person.bio === 'string' ? person.bio.trim().slice(0, 5000) : '',
      }))
      .filter((person) => person.name);
    return { ok: true, speakers };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'parse-error' };
  } finally {
    clearTimeout(timer);
  }
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
    schedule: Array.isArray(p.schedule)
      ? p.schedule
          .slice(0, 50)
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            time: str(item.time)?.slice(0, 100) ?? '',
            title: str(item.title)?.slice(0, 300) ?? '',
            details: str(item.details)?.slice(0, 2000) ?? '',
          }))
          .filter((item) => item.title !== '')
      : [],
    confidence,
  };
}
