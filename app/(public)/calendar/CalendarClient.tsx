'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EventsList } from '@/components/events/EventsList';
import type { CalendarEvent } from '@/lib/events-store';
import { usePublication } from '@/lib/use-publication';

type View = 'month' | 'upcoming';

function isoDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarClient() {
  const router = useRouter();
  const { pub } = usePublication();

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // S22 hybrid-view state
  const [view, setView] = useState<View>('month');
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Group events by ISO date string for fast lookup in the grid
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!events) return map;
    for (const ev of events) {
      if (!ev.startDate) continue;
      const d = new Date(ev.startDate);
      if (isNaN(d.getTime())) continue;
      const key = isoDateKey(d);
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

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
    const market = pub === 'realtyline' ? 'austin' : 'san_antonio';
    fetch(`/api/events/${market}`)
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
  }, [pub]);

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
      pub={pub}
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
    />
  );
}
