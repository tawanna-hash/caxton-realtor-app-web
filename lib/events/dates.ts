import type { CalendarEvent } from '@/lib/events-store';

export const CAXTON_EV_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CAXTON_EV_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatEventDateLong(iso: string | null): string {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${CAXTON_EV_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatEventTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  let hr = d.getHours();
  const min = d.getMinutes();
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return min === 0 ? `${hr}:00 ${ampm}` : `${hr}:${String(min).padStart(2, '0')} ${ampm}`;
}

export function formatEventTimeRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = formatEventTime(start);
  if (!end) return s;
  const e = formatEventTime(end);
  if (!e || e === s) return s;
  return `${s} – ${e}`;
}

export function monthKey(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'TBD';
  return `${CAXTON_EV_MONTHS[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

export function dayOfMonth(iso: string | null): { mo: string; dy: string } {
  if (!iso) return { mo: 'TBD', dy: '?' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { mo: 'TBD', dy: '?' };
  return { mo: CAXTON_EV_MONTHS_SHORT[d.getMonth()].toUpperCase(), dy: String(d.getDate()) };
}

// Group events by month-year for the list rendering.
// Drops expired events first (anything whose end date is before today's midnight).
export function groupByMonth(events: CalendarEvent[]): Array<{ key: string; events: CalendarEvent[] }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const liveEvents = events.filter((ev) => {
    const lastDay = new Date(ev.endDate || ev.startDate || '');
    return !isNaN(lastDay.getTime()) && lastDay >= todayStart;
  });
  const groups: Record<string, CalendarEvent[]> = {};
  const order: string[] = [];
  liveEvents.forEach((ev) => {
    const k = monthKey(ev.startDate);
    if (!(k in groups)) {
      groups[k] = [];
      order.push(k);
    }
    groups[k].push(ev);
  });
  return order.map((k) => ({ key: k, events: groups[k] }));
}
