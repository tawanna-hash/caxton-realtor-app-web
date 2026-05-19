import type { CalendarEvent } from '@/lib/events-store';

export function isSponsored(ev: CalendarEvent): boolean {
  return ev.sponsored === '1' || ev.sponsored === 'true' || ev.sponsored === 'yes';
}
