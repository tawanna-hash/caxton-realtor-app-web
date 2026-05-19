'use client';

// DayEventList — vertical list of events for a single selected day.
// Reuses EventCard. No month grouping; the day is implicit from selection.

import type { CalendarEvent } from '@/lib/events-store';
import { PUB_META, type PubKey } from '@/lib/pub-meta';
import { EventCard } from './EventCard';

interface DayEventListProps {
  pub: PubKey;
  date: Date;
  events: CalendarEvent[];
  onSelect: (ev: CalendarEvent) => void;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function DayEventList({ pub, date, events, onSelect }: DayEventListProps) {
  const info = PUB_META[pub] || PUB_META.realtyline;
  const heading = `${DOW_FULL[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;

  return (
    <div>
      <div className="px-4 py-3 bg-gray-50 border-y border-gray-200">
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">{heading}</p>
      </div>
      {events.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm text-gray-400 font-light">No events on this day.</p>
        </div>
      ) : (
        events.map((ev) => (
          <EventCard
            key={ev.id}
            event={ev}
            pubColor={info.color}
            onClick={() => onSelect(ev)}
          />
        ))
      )}
    </div>
  );
}
