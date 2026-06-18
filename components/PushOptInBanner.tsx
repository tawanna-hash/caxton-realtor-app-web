'use client';

// components/PushOptInBanner.tsx
//
// Slim banner that prompts users to enable web push notifications. The
// whole banner hides itself when push isn't actionable (unsupported,
// already on, or permission denied), so it never clutters the feed for
// users who have already opted in or can't opt in at all.

import { useEffect, useState } from 'react';
import PushOptInButton from './PushOptInButton';

type Props = {
  realtorId?: string | null;
  market?: 'austin' | 'san_antonio' | null;
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
    <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
      <PushOptInButton
        hideWhenInactive
        realtorId={realtorId ?? null}
        market={market ?? null}
        className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium text-white bg-[#021D40] hover:bg-[#03285a] whitespace-nowrap"
      />
      <span className="text-xs text-amber-800 font-light hidden sm:inline">
        Get breaking news and new issues delivered instantly.
      </span>
    </div>
  );
}
