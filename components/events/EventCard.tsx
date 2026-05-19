'use client';

import type { CalendarEvent } from '@/lib/events-store';
import { decodeEntities } from '@/lib/events/text';
import { isSponsored } from '@/lib/events/sponsorship';
import { dayOfMonth, formatEventTimeRange } from '@/lib/events/dates';

export interface EventCardProps {
  event: CalendarEvent;
  pubColor: string;
  onClick: () => void;
}

export function EventCard({ event, pubColor, onClick }: EventCardProps) {
  const { mo, dy } = dayOfMonth(event.startDate);
  const sponsored = isSponsored(event);
  const tier = event.sponsor_tier || 'standard';
  const isHero = sponsored && tier === 'hero';

  return (
    <button
      onClick={onClick}
      className="w-full bg-white border-b border-gray-200 hover:bg-gray-50 text-left transition-colors"
      style={sponsored ? { borderLeft: `4px solid ${pubColor}` } : undefined}
    >
      <div className={`flex gap-4 ${isHero ? 'px-4 py-6' : 'px-4 py-5'}`}>
        {/* Date block */}
        <div
          className={`flex-shrink-0 ${isHero ? 'w-20 h-20' : 'w-16 h-16'} flex flex-col items-center justify-center rounded`}
          style={{ backgroundColor: pubColor }}
        >
          <span className="text-xs uppercase text-white/60 font-medium leading-none tracking-wider">{mo}</span>
          <span className={`${isHero ? 'text-3xl' : 'text-2xl'} font-medium text-white leading-none mt-1`}>{dy}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {sponsored && (
            <p className="text-xs uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: pubColor }}>
              {event.sponsor_advertiser ? `Sponsored · ${event.sponsor_advertiser}` : 'Sponsored'}
            </p>
          )}
          <h3 className={`${isHero ? 'text-2xl' : 'text-xl'} text-gray-900 leading-snug mb-1 font-semibold`}>
            {decodeEntities(event.title)}
          </h3>
          {event.startDate && (
            <p className="text-base text-gray-500 font-light">{formatEventTimeRange(event.startDate, event.endDate)}</p>
          )}
          {event.location && (
            <p className="text-base text-gray-500 font-light">{event.location}</p>
          )}
          {event.organizer && (
            <p className="text-sm font-medium mt-2 uppercase tracking-wider" style={{ color: pubColor }}>
              {event.organizer}
            </p>
          )}
        </div>

      
      </div>
    </button>
  );
}
