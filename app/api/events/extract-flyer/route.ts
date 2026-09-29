import { NextResponse, type NextRequest } from 'next/server';
import { extractFromEventFlyer } from '@/lib/server/gemini-event-flyer-extract';
import { parseEventWhen, combineTimeRange } from '@/lib/server/event-date-parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const recentRequests = new Map<string, number[]>();

function localDate(iso: string | null): string | null {
  const match = /^(\\d{4}-\\d{2}-\\d{2})T(\\d{2}:\\d{2})/.exec(iso ?? '');
  return match ? `${match[1]}T${match[2]}` : null;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  const hits = (recentRequests.get(ip) ?? []).filter((time) => now - time < 60_000);
  if (hits.length >= 4) {
    return NextResponse.json({ ok: false, error: 'Too many flyer scans. Please try again in a minute.' }, { status: 429 });
  }
  hits.push(now);
  recentRequests.set(ip, hits);

  const form = await req.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Choose a JPG, PNG, or WebP flyer up to 10 MB.' }, { status: 400 });
  }

  const result = await extractFromEventFlyer({
    imageBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    mimeType: file.type,
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      error: result.reason === 'rate-limit'
        ? 'Flyer scanning is busy. Please try again shortly.'
        : 'Could not read the flyer. You can still fill in the form manually.',
    }, { status: result.reason === 'rate-limit' ? 429 : 503 });
  }

  const timeRange = combineTimeRange(result.data.startTime, result.data.endTime);
  const { startDate, endDate } = parseEventWhen(result.data.date, timeRange, null);
  return NextResponse.json({
    ok: true,
    extracted: {
      title: result.data.title,
      description: result.data.description,
      startDate: localDate(startDate),
      endDate: localDate(endDate),
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
}
