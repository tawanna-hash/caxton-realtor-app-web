import type { CalendarEvent } from '@/lib/events-store';
import { decodeEntities } from './text';

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoToICS(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // Format: YYYYMMDDTHHMMSS (local time, no Z)
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
}

function escapeICS(s: string): string {
  return (s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function generateICS(event: CalendarEvent): string {
  const dtstart = isoToICS(event.startDate);
  const dtend = isoToICS(event.endDate || event.startDate);
  const uid = `event-${event.id}@caxton`;
  const now = isoToICS(new Date().toISOString().replace('Z', ''));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Caxton Publications, Inc.//Realtor App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtstart ? `DTSTART:${dtstart}` : '',
    dtend ? `DTEND:${dtend}` : '',
    `SUMMARY:${escapeICS(decodeEntities(event.title))}`,
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeICS(decodeEntities(event.description))}` : '',
    event.link ? `URL:${event.link}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}
