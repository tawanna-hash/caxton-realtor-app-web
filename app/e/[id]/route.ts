import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, getSql } from '@/lib/db';
import { captureServerEvent, flushServerEvents } from '@/lib/server/posthog';

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

// The PostHog browser SDK sets a first-party cookie named
// `ph_<project_key>_posthog` containing a JSON blob with `distinct_id`.
// Reading it here (rather than hardcoding the project key) lets a click
// share the same anonymous visitor id the browser already uses for every
// other tracked event, without importing PostHog's client SDK server-side.
function readPosthogDistinctId(req: NextRequest): string | null {
  for (const cookie of req.cookies.getAll()) {
    if (!cookie.name.startsWith('ph_') || !cookie.name.endsWith('_posthog')) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(cookie.value)) as { distinct_id?: string };
      if (parsed.distinct_id) return parsed.distinct_id;
    } catch {
      // Malformed cookie value; fall through to the next candidate.
    }
  }
  return null;
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

  // Visitor attribution: reuse the browser's existing PostHog anonymous id
  // when present so repeat clicks from the same device group together in
  // the admin click log below. Readers never log in to browse events, so
  // this identifies a *device/browser*, not a person or email address.
  const visitorId = readPosthogDistinctId(req) ?? `anon_${randomUUID()}`;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const city = req.headers.get('x-vercel-ip-city')
    ? decodeURIComponent(req.headers.get('x-vercel-ip-city') as string)
    : null;
  const region = req.headers.get('x-vercel-ip-country-region');
  const country = req.headers.get('x-vercel-ip-country');
  const userAgent = req.headers.get('user-agent');
  const referrer = req.headers.get('referer');

  // Use the same event name consumed by Admin > Reports > Events. Recording
  // at the redirect makes the count authoritative and avoids browser-side
  // analytics blockers or duplicate client/server events.
  captureServerEvent('event_register_clicked', visitorId, {
    event_id: event.id,
    event_title: event.title,
    pub: event.publication,
    website: event.destination,
    tracked_url: new URL(`/e/${event.id}`, req.url).toString(),
    destination_host: destination.hostname,
    source: 'event_short_link',
    $geoip_city_name: city,
    $geoip_country_name: country,
  });

  await Promise.all([
    flushServerEvents(),
    sql`
      INSERT INTO event_registration_clicks
        (event_id, visitor_id, ip, city, region, country, user_agent, referrer, destination_host)
      VALUES
        (${event.id}, ${visitorId}, ${ip}, ${city}, ${region}, ${country}, ${userAgent}, ${referrer}, ${destination.hostname})
    `.catch((err: unknown) => {
      // Click logging must never block the redirect the visitor is waiting on.
      console.error('[event-register-click] insert failed', err);
    }),
  ]);

  return NextResponse.redirect(destination, 302);
}
