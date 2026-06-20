'use client';

// Lightweight billing alerts badge for the admin top nav. Polls
// /api/admin/billing/notifications every 60s and renders an amber pill
// when there are expiring agreements (≤30d) or overdue invoices.
//
// Mirrors UnreadAdsBadge: silent on zero, fails open on errors.
//
// Variants:
//   <BillingAlertsBadge />            — small absolute-positioned dot+count
//   <BillingAlertsBadge variant="inline" /> — chip inside a menu item

import { useCallback, useEffect, useState } from 'react';

interface BillingNotifResponse {
  expiring30: number;
  overdue: number;
  total: number;
}

interface Props {
  variant?: 'dot' | 'inline';
  pollMs?: number;
}

const FALLBACK: BillingNotifResponse = { expiring30: 0, overdue: 0, total: 0 };

export default function BillingAlertsBadge({
  variant = 'dot',
  pollMs = 60_000,
}: Props) {
  const [data, setData] = useState<BillingNotifResponse>(FALLBACK);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/billing/notifications', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const json = (await res.json()) as BillingNotifResponse;
      setData(json);
    } catch {
      // Silent — last known value wins.
    }
  }, []);

  useEffect(() => {
    // refetch is what owns setState; the effect just wires polling + visibility.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const count = data.total;
  if (count <= 0) return null;

  const label = count > 99 ? '99+' : String(count);
  const ariaParts: string[] = [];
  if (data.overdue > 0) ariaParts.push(`${data.overdue} overdue invoice${data.overdue === 1 ? '' : 's'}`);
  if (data.expiring30 > 0) ariaParts.push(`${data.expiring30} agreement${data.expiring30 === 1 ? '' : 's'} expiring within 30 days`);
  const ariaLabel = ariaParts.join(', ') || `${count} billing alerts`;

  // Amber for renewal urgency vs. red for unread inquiries — distinct
  // visual language between the two badge surfaces.
  if (variant === 'inline') {
    return (
      <span
        className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none"
        aria-label={ariaLabel}
      >
        {label}
      </span>
    );
  }

  // Offset left so it doesn't overlap the red UnreadAdsBadge on the same
  // Revenue group button (both render absolute-positioned).
  return (
    <span
      className="absolute -top-1 right-4 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-amber-500 text-white text-[10px] font-semibold leading-none ring-2 ring-[#301D5D]"
      aria-label={ariaLabel}
    >
      {label}
    </span>
  );
}
