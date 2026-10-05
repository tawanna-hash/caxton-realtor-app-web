'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';

type PendingEvent = {
  id: number;
  externalSource: string;
  title: string;
  startDate: string | null;
  location: string | null;
  publication?: string;
};

function formatWhen(value: string | null): string {
  if (!value) return 'Date not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Date not set';
  return d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** Public event submissions waiting for admin review. */
export default function PendingSubmissions({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<PendingEvent[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    adminApi.listPendingEvents()
      .then((res: { events?: PendingEvent[] }) => {
        if (live) setItems((res?.events ?? []).filter((e) => e.externalSource === 'submission'));
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : 'Could not load submissions');
        setItems([]);
      });
    return () => { live = false; };
  }, [tick]);

  const act = async (ev: PendingEvent, kind: 'approve' | 'delete') => {
    if (kind === 'delete' && !window.confirm(`Delete "${ev.title}"? This cannot be undone.`)) return;
    setBusyId(ev.id);
    setError(null);
    try {
      if (kind === 'approve') await adminApi.approvePendingEvent(ev.id);
      else await adminApi.deleteEvent(ev.id);
      setTick((n) => n + 1);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (items === null || (items.length === 0 && !error)) return null;

  return (
    <section aria-label="Submitted events" className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-sm font-semibold text-amber-950">
        Submitted events awaiting review ({items.length})
      </h2>
      <p className="mt-1 text-xs text-amber-800">Public submissions are not shown on the Calendar until you approve them.</p>
      {error && <p className="mt-2 text-xs font-medium text-red-700" role="alert">{error}</p>}
      <ul className="mt-3 divide-y divide-amber-200 rounded-md border border-amber-200 bg-white">
        {items.map((ev) => (
          <li key={ev.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{ev.title}</p>
              <p className="text-xs text-gray-500">{formatWhen(ev.startDate)}{ev.location ? ` · ${ev.location}` : ''}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href={`/admin/events/${ev.id}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">Review</Link>
              <button type="button" disabled={busyId === ev.id} onClick={() => act(ev, 'approve')} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">Approve</button>
              <button type="button" disabled={busyId === ev.id} onClick={() => act(ev, 'delete')} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
