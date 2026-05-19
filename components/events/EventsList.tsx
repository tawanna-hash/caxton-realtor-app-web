'use client';

import { PUB_META, type PubKey } from '@/lib/pub-meta';
import { SW } from '@/lib/style-constants';
import type { CalendarEvent } from '@/lib/events-store';
import { groupByMonth } from '@/lib/events/dates';
import { trackEvent } from '@/app/posthog-provider';
import { EventCard } from './EventCard';
import { EventSkeleton } from './EventSkeleton';

export interface EventsListProps {
  pub: string;
  topBanner?: React.ReactNode;
  events: CalendarEvent[] | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onSelect: (ev: CalendarEvent) => void;
}

export function EventsList({ pub, events, loading, error, onBack, onSelect, topBanner }: EventsListProps) {
  const info = PUB_META[pub as PubKey] || PUB_META.realtyline;
  const list = events ?? [];
  const groups = groupByMonth(list);

  return (
    <div className="fixed inset-0 bg-white z-30 overflow-y-auto" style={SW}>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.25em] text-gray-900 font-medium ml-2">Events</p>
        </div>
        <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium">{info.city}</span>
      </div>

      {/* Body */}
      <div className="pb-24">
        {topBanner}
        {loading && (
          <div className="px-4 py-6">
            <EventSkeleton />
            <EventSkeleton />
            <EventSkeleton />
          </div>
        )}

        {!loading && error && list.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-base text-gray-500 font-light">Couldn&apos;t load events. Showing a few examples instead.</p>
          </div>
        )}

        {!loading && !error && list.length === 0 && (
          <div className="px-4 py-16 text-center">
            <p className="text-base text-gray-400 font-light">No upcoming events in {info.city} yet.</p>
            <p className="text-sm text-gray-400 font-light mt-2">Check back soon.</p>
          </div>
        )}

        {!loading && groups.map((group) => (
          <div key={group.key}>
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">{group.key}</p>
            </div>
            {group.events.map((ev) => (
              <EventCard key={ev.id} event={ev} pubColor={info.color} onClick={() => { trackEvent('event_card_clicked', { event_id: ev.id, event_title: ev.title, pub }); onSelect(ev); }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
