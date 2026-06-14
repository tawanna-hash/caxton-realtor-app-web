'use client';

// Lightweight unread counter for the admin top nav. Polls
// /api/admin/ads/notifications every 60s and renders a red pill with the
// total count of inquiries still in status='new'. The badge silently
// disappears when there's nothing unread (or when the endpoint fails open
// in sandbox builds).
//
// Two render variants:
//   <UnreadAdsBadge />            — small absolute-positioned dot+count
//                                   suitable for overlaying on a nav button
//   <UnreadAdsBadge variant="inline" /> — inline pill suitable for inside
//                                         dropdown menu items
//
// We deliberately keep this client-only and self-fetching — there's no
// server-side counting on each route render.

import { useCallback, useEffect, useState } from 'react';
import type { AdChannel } from '@/lib/ad-channels';

interface UnreadResponse {
  unread: Record<AdChannel | 'all', number>;
  total: number;
}

interface Props {
  /** Render variant — 'dot' (default, absolute) or 'inline' (chip). */
  variant?: 'dot' | 'inline';
  /** Narrow to a single channel — defaults to 'all'. */
  channel?: AdChannel | 'all';
  /** Polling interval in ms. Defaults to 60_000. */
  pollMs?: number;
}

const FALLBACK: UnreadResponse = {
  unread: { all: 0, print: 0, digital: 0, email: 0 },
  total: 0,
};

export default function UnreadAdsBadge({
  variant = 'dot',
  channel = 'all',
  pollMs = 60_000,
}: Props) {
  const [data, setData] = useState<UnreadResponse>(FALLBACK);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ads/notifications', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as UnreadResponse;
      setData(json);
    } catch {
      // Silent — badge stays at its last known value.
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount. Same eslint-disable pattern as the rest of
    // the admin client components — the refetch closure is what owns the
    // setState, not the effect body directly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
    const t = setInterval(refetch, pollMs);
    // Also refetch when the tab becomes visible again so admins coming
    // back from another tab see a fresh count.
    const onVis = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refetch, pollMs]);

  const count = data.unread[channel] ?? 0;
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);

  if (variant === 'inline') {
    return (
      <span
        className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none"
        aria-label={`${count} new ${channel === 'all' ? 'ad inquiry' : channel} inquiries`}
      >
        {label}
      </span>
    );
  }

  // Default 'dot' variant — absolute-positioned for layering on top of a
  // nav button. The parent must be `relative`.
  return (
    <span
      className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-none ring-2 ring-[#1a2a44]"
      aria-label={`${count} new ad inquiries`}
    >
      {label}
    </span>
  );
}
