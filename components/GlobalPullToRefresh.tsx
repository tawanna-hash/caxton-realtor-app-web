'use client';

// components/GlobalPullToRefresh.tsx
//
// App-wide pull-to-refresh for the public variant of AppShell. Lives once
// at the layout level so every public route (Calendar, Builders, Magazine,
// Advertisers, FAQ, About, Communities, Inventory, Resources, etc.) gets
// the gesture without each page wiring its own hook.
//
// Refresh strategy:
//   1. router.refresh()       → re-runs the route's server logic so RSC
//                               pages re-fetch their data (most public
//                               pages are server components).
//   2. caxton:ptr-refresh     → custom event for any client components
//                               that own their own data (drawers, lists,
//                               infinite scroll). Listeners can refetch.
//
// Opt-outs:
//   - Dashboard ('/dashboard' or '/'): the in-page Feed component manages
//     its own tab-aware PTR (news vs. events), so we skip there to avoid
//     double indicators.
//   - Admin: caller does not mount this in the admin variant.
//
// Indicator visual matches the dashboard's existing PTR for consistency.

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { haptics } from '@/lib/native/haptics';

// Routes that own their own PTR or should not refresh on pull.
function isOptedOut(pathname: string | null): boolean {
  if (!pathname) return false;
  // Dashboard Feed has tab-aware PTR built in.
  if (pathname === '/' || pathname === '/dashboard') return true;
  // Article reader / overlay routes that should not yank a refresh.
  if (pathname.startsWith('/dashboard/')) return true;
  return false;
}

export default function GlobalPullToRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const optedOut = isOptedOut(pathname);

  const onRefresh = useCallback(async () => {
    if (optedOut) return;
    void haptics.medium();
    // Re-run the server segment for the current route.
    router.refresh();
    // Let client-side components know to refetch their own data.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('caxton:ptr-refresh', {
        detail: { pathname },
      }));
    }
  }, [optedOut, router, pathname]);

  const ptr = usePullToRefresh(onRefresh);

  // Even when opted out we mount the hook so its effect cleans up
  // consistently across navigations — but the indicator is hidden.
  if (optedOut) return null;
  if (!ptr.pulling && !ptr.refreshing) return null;

  return (
    <div
      aria-live="polite"
      role="status"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center pointer-events-none"
      style={{
        height: Math.max(ptr.distance, ptr.refreshing ? 56 : 0),
        paddingTop: 'env(safe-area-inset-top)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0))',
        transition: ptr.refreshing ? 'height 200ms ease' : 'none',
      }}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] font-medium text-gray-500">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={ptr.refreshing ? 'animate-spin' : undefined}
          style={ptr.refreshing ? undefined : { transform: `rotate(${Math.min(180, ptr.distance * 2)}deg)` }}
        >
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
        <span>
          {ptr.refreshing
            ? 'Refreshing'
            : ptr.armed
            ? 'Release to refresh'
            : 'Pull to refresh'}
        </span>
      </div>
    </div>
  );
}
