// iCal (RFC 5545) feed for the events calendar.
// GET /api/events/austin/ics
// GET /api/events/san_antonio/ics
//
// Designed to be subscribed to from Google Calendar, Apple Calendar, Outlook,
// or any iCal-compatible app. Each event is emitted as a VEVENT with a stable
// UID so calendar apps de-duplicate on re-fetch.

import { listEvents, type Publication, type CalendarEvent } from '@/lib/events-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID: Publication[] = ['austin', 'san_antonio'];

const PUB_NAMES: Record<Publication, string> = {
  austin: 'RealtyLine Austin',
  san_antonio: 'Newsline San Antonio',
};

/** Escape per RFC 5545 §3.3.11 for text values (SUMMARY, DESCRIPTION, LOCATION). */
function icsEscape(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Fold long lines to <=75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    const chunk = line.slice(i, i + (i === 0 ? 75 : 74));
    out.push(i === 0 ? chunk : ' ' + chunk);
    i += i === 0 ? 75 : 74;
  }
  return out.join('\r\n');
}

/** Format a Date as iCal UTC timestamp: YYYYMMDDTHHMMSSZ. */
function formatUTC(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function buildVEvent(ev: CalendarEvent, host: string): string[] {
  const lines: string[] = [];
  lines.push('BEGIN:VEVENT');
  // Stable UID: id@host keeps re-fetches idempotent.
  lines.push(`UID:event-${ev.id}@${host}`);
  lines.push(`DTSTAMP:${formatUTC(new Date())}`);

  const start = ev.startDate ? new Date(ev.startDate) : null;
  const end = ev.endDate ? new Date(ev.endDate) : null;
  if (start && !isNaN(start.getTime())) {
    lines.push(`DTSTART:${formatUTC(start)}`);
    // Default to +1h when no end date present so calendar apps render a block.
    const safeEnd =
      end && !isNaN(end.getTime())
        ? end
        : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push(`DTEND:${formatUTC(safeEnd)}`);
  }

  lines.push(`SUMMARY:${icsEscape(ev.title || 'Event')}`);

  const descParts: string[] = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.organizer) descParts.push(`Organizer: ${ev.organizer}`);
  if (ev.link) descParts.push(ev.link);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${icsEscape(descParts.join('\n\n'))}`);
  }

  if (ev.location) {
    lines.push(`LOCATION:${icsEscape(ev.location)}`);
  }
  if (ev.link) {
    lines.push(`URL:${ev.link}`);
  }
  if (ev.lat != null && ev.lng != null) {
    lines.push(`GEO:${ev.lat};${ev.lng}`);
  }
  lines.push('END:VEVENT');
  return lines;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ publication: string }> },
) {
  const { publication } = await context.params;
  if (!VALID.includes(publication as Publication)) {
    return new Response('Invalid publication', { status: 400 });
  }

  const url = new URL(req.url);
  const host = url.host;
  const pub = publication as Publication;
  const calName = `${PUB_NAMES[pub]} \u2014 Real Estate Events`;

  let events: CalendarEvent[] = [];
  try {
    events = await listEvents(pub);
  } catch (err) {
    console.error('[ICS] Failed to list events:', err);
    return new Response('Failed to build calendar', { status: 500 });
  }

  // Only include events with a startDate, and drop ones in the distant past
  // (>30 days old) to keep the feed small. Calendar apps refetch periodically.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const filtered = events.filter((ev) => {
    if (!ev.startDate) return false;
    const t = new Date(ev.startDate).getTime();
    return !isNaN(t) && t >= cutoff;
  });

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Realty News Now//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    `NAME:${icsEscape(calName)}`,
    'X-WR-TIMEZONE:America/Chicago',
    // Refresh hint: 1 hour. Most clients honor at least one of these.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const ev of filtered) {
    lines.push(...buildVEvent(ev, host));
  }
  lines.push('END:VCALENDAR');

  // CRLF line endings + 75-octet folding per RFC 5545.
  const body = lines.map(foldLine).join('\r\n') + '\r\n';
  const filename = `${pub}-events.ics`;

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  });
}
