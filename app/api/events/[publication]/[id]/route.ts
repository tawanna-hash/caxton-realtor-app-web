// caxton-events-v1
// GET /api/events/austin/123       -> { event: CalendarEvent }
// GET /api/events/san_antonio/456  -> { event: CalendarEvent }
// 404 if the event doesn't exist, is hidden, or belongs to a different pub.

import { getEventById, type Publication } from '@/lib/events-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Publication[] = ['austin', 'san_antonio'];

export async function GET(
  _req: Request,
  context: { params: Promise<{ publication: string; id: string }> },
) {
  const { publication, id: idParam } = await context.params;
  if (!VALID.includes(publication as Publication)) {
    return Response.json(
      {
        error: 'invalid_publication',
        message: "publication must be 'austin' or 'san_antonio'",
      },
      { status: 400 },
    );
  }
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return Response.json(
      { error: 'invalid_id', message: 'id must be a positive integer' },
      { status: 400 },
    );
  }
  try {
    const event = await getEventById(publication as Publication, id);
    if (!event) {
      return Response.json(
        { error: 'event_not_found', message: 'No such event' },
        { status: 404 },
      );
    }
    return Response.json(
      { event },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      },
    );
  } catch (err) {
    console.error('[/api/events/[publication]/[id]] error', err);
    return Response.json(
      { error: 'events_unavailable', message: 'Could not load event' },
      { status: 500 },
    );
  }
}
