import type { CalendarEvent } from '@/lib/events-store';

const centralDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dateKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(centralDate.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localDay(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  // Noon avoids clock-change gaps while walking days across DST boundaries.
  return new Date(year, month - 1, day, 12);
}

function keyForDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Expand an existing event across every day it occupies in the visible 42-day grid. */
export function eventsForCalendarDays(
  events: CalendarEvent[],
  month: Date,
): Map<string, CalendarEvent[]> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  first.setDate(first.getDate() - first.getDay());
  const last = new Date(first);
  last.setDate(last.getDate() + 41);
  const firstKey = keyForDay(first);
  const lastKey = keyForDay(last);
  const byDay = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const start = dateKey(event.startDate);
    if (!start) continue;
    const end = dateKey(event.endDate);
    const finalDay = end && end >= start ? end : start;
    if (start > lastKey || finalDay < firstKey) continue;

    const cursor = localDay(start < firstKey ? firstKey : start);
    const stop = finalDay < lastKey ? finalDay : lastKey;
    while (keyForDay(cursor) <= stop) {
      const key = keyForDay(cursor);
      const dayEvents = byDay.get(key) ?? [];
      dayEvents.push(event);
      byDay.set(key, dayEvents);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return byDay;
}
