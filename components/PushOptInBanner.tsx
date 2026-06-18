'use client';

// components/PushOptInBanner.tsx
//
// Tiny inline opt-in pill that prompts users to enable web push. The
// whole banner hides itself when push isn't actionable (unsupported,
// already on, or permission denied), so it never clutters the feed for
// users who already opted in or can't opt in at all.

import { useEffect, useState } from 'react';
import PushOptInButton, { type PushMarket } from './PushOptInButton';

type Props = {
  realtorId?: string | null;
  market?: PushMarket | null;
};

export default function PushOptInBanner({ realtorId, market }: Props) {
  const [actionable, setActionable] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setActionable(false);
      return;
    }
    if (Notification.permission === 'denied') {
      setActionable(false);
      return;
    }
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setActionable(!sub);
      } catch {
        setActionable(true);
      }
    })();
  }, []);

  if (!actionable) return null;

  return (
    <div className="px-3 py-1 bg-amber-50 border-b border-amber-200 flex items-center justify-end gap-2">
      <span className="text-[11px] text-amber-800 font-light hidden sm:inline">
        Breaking news alerts
      </span>
      <PushOptInButton
        hideWhenInactive
        realtorId={realtorId ?? null}
        market={market ?? null}
        label="Turn on"
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium text-white bg-[#021D40] hover:bg-[#03285a] whitespace-nowrap"
      />
    </div>
  );
}
