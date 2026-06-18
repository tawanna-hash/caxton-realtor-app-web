'use client';

import { useState } from 'react';
import { PUB_META, type PubKey } from '@/lib/pub-meta';
import { SW } from '@/lib/style-constants';
import type { CalendarEvent } from '@/lib/events-store';
import PageTitle from '@/components/ui/PageTitle';
import { AdSlot } from '@/components/ads/AdSlot';
import { groupByMonth } from '@/lib/events/dates';
import { MonthGrid } from './MonthGrid';
import { DayEventList } from './DayEventList';
import { EventsViewToggle } from './EventsViewToggle';
import { trackEvent } from '@/app/posthog-provider';
import { EventCard } from './EventCard';
import { EventSkeleton } from './EventSkeleton';
import { SubscribeCalendarModal } from './SubscribeCalendarModal';

export interface EventsListProps {
  pub: string;
  topBanner?: React.ReactNode;
  // S22 hybrid view: when these are passed, EventsList renders the
  // month-grid + day-event-list composite instead of the date-grouped list.
  view?: 'month' | 'upcoming';
  displayMonth?: Date;
  selectedDay?: Date | null;
  eventsByDate?: Map<string, import('@/lib/events-store').CalendarEvent[]>;
  onViewChange?: (v: 'month' | 'upcoming') => void;
  onSelectDay?: (d: Date | null) => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  events: CalendarEvent[] | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onSelect: (ev: CalendarEvent) => void;
}

export function EventsList({ pub, events, loading, error, onBack, onSelect, topBanner, view, displayMonth, selectedDay, eventsByDate, onViewChange, onSelectDay, onPrevMonth, onNextMonth }: EventsListProps) {
  const info = PUB_META[pub as PubKey] || PUB_META.realtyline;
  const list = events ?? [];
  const groups = groupByMonth(list);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-white z-30 overflow-y-auto" style={SW}>
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 border-b border-gray-200 px-3 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={onBack} aria-label="Back" className="text-gray-900 p-2 -ml-2 min-w-[44px] min-h-[44px] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-900 font-medium ml-2">Events</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              trackEvent('calendar_subscribe_open', { pub });
              setSubscribeOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs uppercase tracking-[0.15em] text-gray-900 font-medium border border-gray-300 hover:border-gray-900 hover:bg-gray-50 transition-colors rounded-md"
            aria-label="Subscribe to this calendar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="19"/><line x1="9.5" y1="16.5" x2="14.5" y2="16.5"/></svg>
            Subscribe
          </button>
          <span className="text-xs uppercase tracking-[0.2em] text-gray-400 font-medium hidden sm:inline">{info.city}</span>
        </div>
      </div>

      <SubscribeCalendarModal
        open={subscribeOpen}
        onClose={() => setSubscribeOpen(false)}
        pub={pub as PubKey}
      />

      {/* Top banner promoted slot — calendar_top_banner. Eyebrow text is
          split to dodge cosmetic ad-blocker filters that hide elements
          whose text matches /advertisement/i. */}
      <div className="bg-white border-b border-gray-200">
        <p
          aria-label="Advertising partner"
          className="text-[10px] uppercase tracking-[0.3em] text-gray-400 text-center pt-3 pb-2 font-medium"
        >
          <span aria-hidden="true">{'Advertising'}</span>
          <span aria-hidden="true">{'\u00a0Partner'}</span>
        </p>
        <div className="pb-3 px-4">
          <AdSlot slug="calendar_top_banner" variant="bare" />
        </div>
      </div>

      {/* Body */}
      <div className="pb-24">
        {/* Page header — matches the drawer-page kit (Builders, Resources, etc.) */}
        <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 mb-2">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            {pub === 'newsline' ? 'Newsline San Antonio' : 'RealtyLine Austin'}
          </p>
          <PageTitle size="md">
            Calendar of Events
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
            {pub === 'newsline'
              ? `Explore San Antonio\u2019s most complete guide to real estate events with Newsline San Antonio. Our calendar highlights the best industry happenings \u2014 from networking mixers and training sessions to open houses, expos, and association meetings. Stay connected to the people, trends, and opportunities shaping the local real estate market. Whether you\u2019re an agent, broker, or industry partner, our calendar helps you make the most of every event that matters.`
              : `Explore Austin\u2019s most complete guide to real estate events with RealtyLine Austin. Our calendar highlights the best industry happenings \u2014 from networking mixers and training sessions to open houses, expos, and association meetings. Stay connected to the people, trends, and opportunities shaping the local real estate market. Whether you\u2019re an agent, broker, or industry partner, our calendar helps you make the most of every event that matters.`}
          </p>
          <AdSlot slug="calendar_event_sponsor" className="mt-6" />
        </div>
        {topBanner}
        {/* S22 view toggle — only render if month-view props are wired */}
        {view !== undefined && onViewChange && (
          <EventsViewToggle pub={pub as PubKey} value={view} onChange={onViewChange} />
        )}

        {/* S22 month-view branch */}
        {view === 'month' && displayMonth && eventsByDate && onSelectDay && onPrevMonth && onNextMonth && (
          <>
            <MonthGrid
              pub={pub as PubKey}
              month={displayMonth}
              eventsByDate={new Map(Array.from(eventsByDate.entries()).map(([k, v]) => [k, v.length]))}
              selectedDay={selectedDay ?? null}
              onSelectDay={onSelectDay}
              onPrevMonth={onPrevMonth}
              onNextMonth={onNextMonth}
            />
            {selectedDay && (
              <DayEventList
                pub={pub as PubKey}
                date={selectedDay}
                events={eventsByDate.get(`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`) ?? []}
                onSelect={onSelect}
              />
            )}
            {!selectedDay && !loading && (
              <div className="px-4 py-10 text-center">
                <p className="text-sm text-gray-400 font-light">Tap a day to see events.</p>
              </div>
            )}
          </>
        )}

        {/* Legacy/upcoming view (existing behavior) — only when not in month view */}
        {view !== 'month' && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
