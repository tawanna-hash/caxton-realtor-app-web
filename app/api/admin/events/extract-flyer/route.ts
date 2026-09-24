/**
 * POST /api/admin/events/extract-flyer
 *
 * Multipart/form-data:
 *   field `image` — a PNG/JPEG/WEBP raster of an event flyer.
 *
 * Returns:
 *   { ok: true, extracted: { title, description, startDate, endDate,
 *       location, organizer, organizerEmail, website, format, courseNumber,
 *       memberPrice, nonmemberPrice, instructorName, instructorBio, schedule,
 *       rawDate, rawTime, confidence } }
 *
 * The client (New/Edit Event admin form) merges `extracted` into its form
 * state; startDate/endDate are pre-parsed into "YYYY-MM-DDTHH:mm" local
 * input format when the flyer's date/time text was parseable, and the raw
 * verbatim strings are always included so the admin can fix a bad parse
 * by hand instead of losing the reference entirely.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/server/auth/admin';
import { extractFromEventFlyer } from '@/lib/server/gemini-event-flyer-extract';
import { parseEventWhen, combineTimeRange } from '@/lib/server/event-date-parse';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';
import { withAdminTracking } from '@/lib/server/admin-tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Gemini vision calls can push past the default 10s.
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the public flyer-upload limit
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

/** "YYYY-MM-DDTHH:mm:ss±HH:MM" ISO -> "YYYY-MM-DDTHH:mm" for a datetime-local input. */
function isoToLocalInput(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]}T${m[2]}` : null;
}

export const POST = withAdminTracking(async function POST(req: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ ok: false, error: 'invalid form', detail: errMessage(err) }, { status: 400 });
  }

  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'image file required (field "image")' }, { status: 400 });
  }

  const mimeType = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { ok: false, error: `unsupported file type: ${mimeType || '(unknown)'}` },
      { status: 415 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `file too large: ${file.size} bytes (max ${MAX_BYTES})` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const imageBase64 = buf.toString('base64');

  const result = await extractFromEventFlyer({ imageBase64, mimeType });
  if (!result.ok) {
    captureServerEvent('event_flyer_extract_failed', admin.email ?? 'server', {
      surface: 'admin_events',
      reason: result.reason,
      mime_type: mimeType,
      byte_size: file.size,
    });
    await flushServerEvents();
    return NextResponse.json(
      { ok: false, error: 'extraction failed', reason: result.reason, detail: result.detail },
      { status: result.reason === 'no-key' ? 501 : 502 },
    );
  }

  const timeRange = combineTimeRange(result.data.startTime, result.data.endTime);
  const { startDate, endDate } = parseEventWhen(result.data.date, timeRange, null);

  captureServerEvent('event_flyer_extracted', admin.email ?? 'server', {
    surface: 'admin_events',
    confidence: result.data.confidence,
    parsed_date: Boolean(startDate),
  });
  await flushServerEvents();

  return NextResponse.json({
    ok: true,
    extracted: {
      title: result.data.title,
      description: result.data.description,
      startDate: isoToLocalInput(startDate),
      endDate: isoToLocalInput(endDate),
      location: result.data.location,
      organizer: result.data.organizer,
      organizerEmail: result.data.organizerEmail,
      website: result.data.website,
      format: result.data.format,
      courseNumber: result.data.courseNumber,
      memberPrice: result.data.memberPrice,
      nonmemberPrice: result.data.nonmemberPrice,
      instructorName: result.data.instructorName,
      instructorBio: result.data.instructorBio,
      schedule: result.data.schedule,
      rawDate: result.data.date,
      rawTime: timeRange,
      confidence: result.data.confidence,
    },
  });
});
