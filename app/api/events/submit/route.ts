import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, withErrorHandling } from '@/lib/server/error';
import { manualEventInputSchema } from '@/lib/server/schemas/events';
import { createSubmittedEvent } from '@/lib/server/events-store';
import { notifyAdminsPendingEvent } from '@/lib/server/event-pending-notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const publicEventInputSchema = manualEventInputSchema.extend({
  startDate: z.string().datetime(),
  organizer: z.string().trim().min(2).max(500),
  organizerEmail: z.string().trim().email().max(500),
  hp: z.string().optional(),
});

const recentSubmissions = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 4;
const APPROVAL_RECIPIENTS = [
  'tawanna@myrealtyline.com',
  'caroline@myrealtyline.com',
];

function requesterKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitAllows(key: string): boolean {
  const now = Date.now();
  const hits = (recentSubmissions.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recentSubmissions.set(key, hits);
  return hits.length <= MAX_PER_WINDOW;
}

export const POST = withErrorHandling(async (req: Request) => {
  if (!rateLimitAllows(requesterKey(req))) {
    throw new ApiError(429, 'Too many submissions. Please wait a minute and try again.');
  }

  const body = await req.json().catch(() => ({}));
  const input = publicEventInputSchema.parse(body);

  if (input.hp?.trim()) {
    return NextResponse.json({ ok: true, queued: true });
  }

  if (input.endDate && new Date(input.endDate).getTime() < new Date(input.startDate).getTime()) {
    throw new ApiError(400, 'End date must be on or after the start date');
  }

  const event = await createSubmittedEvent({
    publication: input.publication,
    title: input.title.trim(),
    description: input.description ?? null,
    link: input.link ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    location: input.location ?? null,
    organizer: input.organizer,
    organizerEmail: input.organizerEmail,
    website: input.website ?? null,
    tags: input.tags ?? null,
    format: input.format ?? null,
    courseNumber: input.courseNumber ?? null,
    memberPrice: input.memberPrice ?? null,
    nonmemberPrice: input.nonmemberPrice ?? null,
    imageUrl: input.imageUrl ?? null,
    imageThumb: input.imageThumb ?? null,
    instructorName: input.instructorName ?? null,
    instructorBio: input.instructorBio ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    advertiserId: null,
  });

  try {
    await notifyAdminsPendingEvent({
      eventId: event.id,
      title: event.title,
      organizer: event.organizer,
      source: 'public-submission',
      startDate: event.startDate,
      recipients: APPROVAL_RECIPIENTS,
    });
  } catch (error) {
    console.warn('[public-event-submit] approval email failed', error);
  }

  return NextResponse.json({ ok: true, queued: true, eventId: event.id }, { status: 201 });
});
