'use client';

// Pending-count badge for the Gmail event review queue, modelled on
// components/UnreadAdsBadge.tsx. Polls the count endpoint and renders nothing
// when the queue is empty, so the nav stays quiet on days the scanner finds
// nothing.

import { useCallback, useEffect, useState } from 'react';

interface Props {
  /** Render variant — 'dot' (default, absolute) or 'inline' (chip). */
  variant?: 'dot' | 'inline';
  /** Polling interval in ms. Defaults to 60_000. */
  pollMs?: number;
}

export default function PendingGmailBadge({ variant = 'dot', pollMs = 60_000 }: Props) {
  const [count, setCount] = useState(0);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/events/gmail/pending/count', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as { count?: number };
      setCount(typeof json.count === 'number' ? json.count : 0);
    } catch {
      // Silent — badge stays at its last known value.
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState lives in the refetch closure, mirrors UnreadAdsBadge
    refetch();
    const t = setInterval(refetch, pollMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refetch, pollMs]);

  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);
  const aria = `${count} Gmail event${count === 1 ? '' : 's'} awaiting review`;

  if (variant === 'inline') {
    return (
      <span
        className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none"
        aria-label={aria}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none ring-2 ring-brand-700"
      aria-label={aria}
    >
      {label}
    </span>
  );
}
