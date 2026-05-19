'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { EventsList } from '@/components/events/EventsList';
import type { CalendarEvent } from '@/lib/events-store';

type Pub = 'realtyline' | 'newsline';

function readPub(): Pub {
  if (typeof window === 'undefined') return 'realtyline';
  try {
    const v = window.localStorage.getItem('caxton_pub');
    if (v === 'realtyline' || v === 'newsline') return v;
  } catch {}
  return 'realtyline';
}

function subscribePub(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', callback);
  window.addEventListener('savedPubChange', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('savedPubChange', callback);
  };
}

const SERVER_PUB: Pub = 'realtyline';
function getServerPubSnapshot(): Pub {
  return SERVER_PUB;
}

export default function CalendarClient() {
  const router = useRouter();
  const pub = useSyncExternalStore(subscribePub, readPub, getServerPubSnapshot);

  const [events, setEvents] = useState<CalendarEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  return (
    <EventsList
      pub={pub}
      events={events}
      loading={loading}
      error={error}
      onBack={() => router.push('/dashboard')}
      onSelect={(ev: CalendarEvent) => router.push(`/calendar/${ev.publication}/${ev.id}`)}
    />
  );
}
