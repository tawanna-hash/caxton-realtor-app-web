'use client';

// components/MarketOnboardingPicker.tsx
//
// First-launch full-screen market picker. Shows once when the user has no
// caxton_pub cookie/localStorage value. The chosen pub persists for 365d so
// subsequent launches go straight to the dashboard. Native iOS users hit
// this on the very first app open after install; web users on the first
// visit per device.
//
// The picker is intentionally NOT dismissible without choosing \u2014 the app
// is publication-scoped and we can't render anything meaningful until the
// user picks. Coming-soon markets route to the same notify-me sheet used
// everywhere else.

import { useEffect, useState } from 'react';
import {
  PUB_ACTIVE,
  PUB_COMING_SOON,
  persistPub,
  type PubId,
} from '@/lib/publications';

// Once we've shown the picker we mark it seen so we don't flash it again
// even if the user later clears their pub. This lives alongside caxton_pub
// in localStorage so it shares the same lifecycle (cleared on logout).
const SEEN_KEY = 'caxton_market_onboarded';

export default function MarketOnboardingPicker() {
  // Default false so SSR + first client commit agree, then flip in effect.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip the onboarding picker when opened for printing (?print=1).
    // The in-app Safari (SFSafariViewController) doesn't share localStorage
    // with the native app, so the picker would intercept the page load.
    const params = new URLSearchParams(window.location.search);
    if (params.get('print') === '1') return;
    queueMicrotask(() => {
      try {
        const seen = localStorage.getItem(SEEN_KEY);
        const pub = localStorage.getItem('caxton_pub');
        const cookiePub = document.cookie
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('caxton_pub='));
        // Already onboarded or pub already chosen \u2014 stay hidden.
        if (seen || pub || cookiePub) return;
        setOpen(true);
      } catch {
        /* privacy mode / quota \u2014 just stay hidden */
      }
    });
  }, []);

  if (!open) return null;

  const handlePick = (id: PubId) => {
    persistPub(id);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
    setOpen(false);
    // No reload \u2014 this is the first launch so nothing pub-scoped has
    // rendered yet. AppShell will re-derive pub from the savedPubChange
    // event persistPub() dispatches.
  };

  const handleNotify = (id: string) => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {}
    setOpen(false);
    window.location.assign(`/?notify=${encodeURIComponent(id)}`);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-white flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Choose your publication"
    >
      <div className="flex-1 overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top)+32px)] pb-8">
        <div className="max-w-md mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 font-medium text-center mb-3">
            Welcome to
          </p>
          <h1 className="text-2xl font-semibold text-gray-900 text-center mb-2">
            Realty News Now
          </h1>
          <p className="text-sm text-gray-500 font-light text-center mb-8 leading-relaxed">
            Choose the market you cover. You can switch any time
            <br />
            from the title bar at the top.
          </p>

          <ul className="space-y-3">
            {PUB_ACTIVE.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handlePick(p.id)}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-brand-700 hover:bg-gray-50 active:bg-gray-100 transition text-left"
                >
                  <span className="w-12 h-12 rounded-full bg-brand-700 text-white flex items-center justify-center text-sm font-semibold">
                    {p.monogram}
                  </span>
                  <span className="flex-1">
                    <span className="block text-base font-semibold text-gray-900">
                      {p.label}
                    </span>
                    <span className="block text-xs text-gray-500 font-light">
                      Tap to start in this market
                    </span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#301D5D"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>

          {PUB_COMING_SOON.length > 0 && (
          <>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400 font-medium text-center mt-8 mb-3">
            Coming soon
          </p>
          <ul className="space-y-2">
            {PUB_COMING_SOON.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleNotify(p.id)}
                  className="w-full flex items-center gap-4 px-4 py-3 rounded-xl border border-dashed border-gray-200 hover:bg-gray-50 active:bg-gray-100 transition text-left"
                >
                  <span className="w-10 h-10 rounded-full bg-gray-50 border border-gray-200 text-gray-400 flex items-center justify-center text-xs font-semibold">
                    {p.monogram}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-gray-600">
                      {p.label}
                    </span>
                    <span className="block text-[11px] text-gray-400">
                      Notify me when it launches
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
