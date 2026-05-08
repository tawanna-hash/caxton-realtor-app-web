// caxton-events-v1
// GET /api/events/austin   -> { events: CalendarEvent[] }
// GET /api/events/san_antonio
// Reads from the events table populated by the daily Unlock MLS cron.

import { listEvents, type Publication } from '@/lib/events-store';

// Always serve a fresh DB read; dashboard does its own client-side caching.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Publication[] = ['austin', 'san_antonio'];

export async function GET(
  _req: Request,
  context: { params: Promise<{ publication: string }> },
) {
  const { publication } = await context.params;
  if (!VALID.includes(publication as Publication)) {
    return Response.json(
      {
        error: 'invalid_publication',
        message: "publication must be 'austin' or 'san_antonio'",
      },
      { status: 400 },
    );
  }
  try {
    const events = await listEvents(publication as Publication);
    return Response.json(
      { events },
      {
        status: 200,
        headers: {
          // No public caching: data is small (~60 rows), cron updates daily,
          // and stale cache made debugging painful. Each request hits the DB.
          'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        },
      },
    );
  } catch (err) {
    console.error('[/api/events] error', err);
    return Response.json(
      {
        error: 'events_unavailable',
        message: 'Could not load events',
      },
      { status: 500 },
    );
  }
}
