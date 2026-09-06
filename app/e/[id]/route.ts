import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { captureServerEvent } from '@/lib/server/posthog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EventLinkRow = {
  id: number;
  title: string;
  publication: string;
  destination: string | null;
};

function safeHomeRedirect(req: NextRequest) {
  return NextResponse.redirect(new URL('/calendar', req.url), 302);
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return safeHomeRedirect(req);

  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT id,
           title,
           publication,
           COALESCE(NULLIF(link, ''), NULLIF(website, '')) AS destination
      FROM events
     WHERE id = ${id}
       AND hidden = false
     LIMIT 1
  `) as unknown as EventLinkRow[];
  const event = rows[0];
  if (!event?.destination) return safeHomeRedirect(req);

  let destination: URL;
  try {
    destination = new URL(event.destination);
    if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
      return safeHomeRedirect(req);
    }
  } catch {
    return safeHomeRedirect(req);
  }

  // Attribute registrations to Realty News Now without exposing a long
  // tracking URL in the Register button. Existing organizer query parameters
  // are preserved; these four UTM values identify our calendar referral.
  destination.searchParams.set('utm_source', 'realtynewsnow');
  destination.searchParams.set('utm_medium', 'event_listing');
  destination.searchParams.set('utm_campaign', 'calendar');
  destination.searchParams.set('utm_content', `event_${event.id}`);

  captureServerEvent('event_registration_redirected', `event-${event.id}`, {
    event_id: event.id,
    event_title: event.title,
    publication: event.publication,
    destination_host: destination.hostname,
    source: 'event_short_link',
  });

  return NextResponse.redirect(destination, 302);
}
