'use client';

import { type PubKey } from '@/lib/pub-meta';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EventDetail } from '@/components/events/EventDetail';
import type { CalendarEvent } from '@/lib/events-store';

type Pub = PubKey;

function pubFromMarket(market: string): Pub {
  return market === 'san_antonio' ? 'newsline' : 'realtyline';
}

export default function CalendarDetailClient() {
  const router = useRouter();
  const params = useParams<{ publication: string; id: string }>();
  const publication = params.publication;
  const id = Number(params.id);

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (
      (publication !== 'austin' && publication !== 'san_antonio') ||
      !Number.isFinite(id) ||
      id <= 0
    ) {
      queueMicrotask(() => {
        setLoading(false);
        setNotFound(true);
      });
      return;
    }
    let cancelled = false;
    fetch(`/api/events/${publication}/${id}`)
      .then((r) => {
        if (r.status === 404) return { event: null, notFound: true };
        if (!r.ok) return Promise.reject(new Error(`HTTP ${r.status}`));
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.notFound || !data.event) {
          setNotFound(true);
        } else {
          setEvent(data.event);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[CalendarDetail] Failed to load:', err);
        setNotFound(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publication, id]);

  if (loading) {
    return (
      <div
        className="fixed inset-0 bg-white z-30 flex items-center justify-center"
      >
        <p className="text-sm text-gray-400 font-light">Loading event…</p>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div
        className="fixed inset-0 bg-white z-30 flex items-center justify-center"
      >
        <div className="text-center px-8">
          <p className="text-gray-500 mb-4">Event not found</p>
          <button
            onClick={() => router.push('/calendar')}
            className="text-sm uppercase tracking-wider font-medium text-gray-900"
          >
            ← Back to calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <EventDetail
      pub={pubFromMarket(event.publication)}
      event={event}
      onBack={() => router.push('/calendar')}
    />
  );
}
