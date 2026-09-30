// caxton-events-v1
// GET /api/events/austin   -> { events: CalendarEvent[] }
// GET /api/events/san_antonio
// Reads from the events table populated by the daily Unlock MLS cron.

import { listEvents } from '@/lib/events-store';
import { isPublicationId } from '@/lib/publications';
import { canViewDallasPreview, dallasForbidden } from '@/lib/server/dallas-preview';
import { ensureRealtyLineCalendarInitialized } from '@/lib/realtyline-calendar-scraper';

// Dallas reads a session cookie for the preview gate, so this route stays
// dynamic per-request; the explicit Cache-Control header above still lets
// the CDN cache non-Dallas responses for a short window.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  context: { params: Promise<{ publication: string }> },
) {
  const { publication } = await context.params;
  if (!isPublicationId(publication)) {
    return Response.json(
      {
        error: 'invalid_publication',
        message: 'publication must be a valid active market',
      },
      { status: 400 },
    );
  }
  if (publication === 'dallas' && !(await canViewDallasPreview())) return dallasForbidden();
  try {
    if (publication === 'austin') {
      await ensureRealtyLineCalendarInitialized().catch((error) => {
        console.error('[/api/events] RealtyLine bootstrap failed', error);
      });
    }
    const events = await listEvents(publication);
    const isDallas = publication === 'dallas';
    return Response.json(
      { events },
      {
        status: 200,
        headers: {
          // Dallas is gated by canViewDallasPreview() — never cache publicly.
          // Other publications are safe for a short CDN cache since the cron
          // updates daily and a 60s edge cache + 5min SWR is imperceptible.
          'Cache-Control': isDallas
            ? 'private, no-store, max-age=0, must-revalidate'
            : 'public, s-maxage=60, stale-while-revalidate=300',
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
