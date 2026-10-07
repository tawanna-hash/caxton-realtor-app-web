'use client';

import { useKeepScroll } from '@/lib/keep-scroll';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EventsList } from '@/components/events/EventsList';
import type { CalendarEvent } from '@/lib/events-store';
import { usePublication } from '@/lib/use-publication';
import { usePtrRefresh } from '@/hooks/use-ptr-refresh';
import { eventsForCalendarDays } from '@/lib/events/calendar-days';

type View = 'month' | 'upcoming';

function isoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarClient() {
  useKeepScroll(true);
  const router = useRouter();
  const { pub } = usePublication();
  // Dallas/Ft. Worth is pre-launch. The server only answers
  // /api/events/dallas for allowlisted accounts (lib/server/dallas-preview),
  // so a 200 here means this signed-in user may preview it.
  const [dallasAllowed, setDallasAllowed] = useState(false);
  const [showDallas, setShowDallas] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/events/dallas', { credentials: 'include' })
      .then((r) => {
        if (cancelled || !r.ok) return;
        setDallasAllowed(true);
        try {
          if (sessionStorage.getItem('calendar_dallas_preview') === '1') setShowDallas(true);
        } catch {}
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // When Dallas/Ft. Worth is the selected market, show it directly.
  const pubIsDallas = pub === 'realtyline-dallas';
  const viewPub = pubIsDallas || (dallasAllowed && showDallas) ? 'realtyline-dallas' : pub;

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Increments on every PTR. Plumbed into the fetch effect below so a
  // pull-to-refresh re-runs the /api/events/<market> request.
  const ptrNonce = usePtrRefresh();

  // S22 hybrid-view state
  const [view, setView] = useState<View>('month');
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Populate every occupied day, including existing multi-day events and
  // spans that began in a previous month.
  const eventsByDate = useMemo(() => {
    return eventsForCalendarDays(events ?? [], displayMonth);
  }, [events, displayMonth]);

  // Default-select today if there are events on today, otherwise no selection.
  // queueMicrotask wrap to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    if (!events || selectedDay !== null) return;
    const todayKey = isoDateKey(today);
    if (eventsByDate.has(todayKey)) {
      queueMicrotask(() => setSelectedDay(today));
    }
  }, [events, eventsByDate, selectedDay, today]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(false);
    });
    const market =
      viewPub === 'realtyline-dallas' ? 'dallas' : viewPub === 'realtyline' ? 'austin' : 'san_antonio';
    fetch(`/api/events/${market}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        const arr = Array.isArray(data?.events) ? data.events : [];
        setEvents(arr);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[Calendar] Failed to load events:', err);
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // ptrNonce intentionally retriggers the fetch on pull-to-refresh.
  }, [viewPub, ptrNonce]);

  function handlePrevMonth() {
    setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    setSelectedDay(null);
  }

  function handleNextMonth() {
    setDisplayMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    setSelectedDay(null);
  }

  return (
    <EventsList
      pub={viewPub}
      events={events}
      loading={loading}
      error={error}
      onBack={() => router.push('/dashboard')}
      onSelect={(ev: CalendarEvent) => router.push(`/calendar/${ev.publication}/${ev.id}`)}
      view={view}
      displayMonth={displayMonth}
      selectedDay={selectedDay}
      eventsByDate={eventsByDate}
      onViewChange={setView}
      onSelectDay={setSelectedDay}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
      // Publication switching lives in the global header. The only banner
      // here is the private Dallas/Ft. Worth preview toggle.
      topBanner={
        dallasAllowed && !pubIsDallas ? (
          <div className="max-w-3xl mx-auto px-4 mb-4">
            <div role="group" aria-label="Calendar market" className="inline-flex rounded-full border border-gray-200 p-1 text-sm">
              <button
                type="button"
                onClick={() => { setShowDallas(false); setSelectedDay(null); try { sessionStorage.removeItem('calendar_dallas_preview'); } catch {} }}
                aria-pressed={!showDallas}
                className={`rounded-full px-4 py-2 ${!showDallas ? 'bg-[#005a8f] text-white' : 'text-gray-700'}`}
              >
                {pub === 'newsline' ? 'San Antonio' : 'Austin'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDallas(true); setSelectedDay(null); try { sessionStorage.setItem('calendar_dallas_preview', '1'); } catch {} }}
                aria-pressed={showDallas}
                className={`rounded-full px-4 py-2 ${showDallas ? 'bg-[#005a8f] text-white' : 'text-gray-700'}`}
              >
                Dallas/Ft. Worth (Preview)
              </button>
            </div>
          </div>
        ) : null
      }
    />
  );
}
