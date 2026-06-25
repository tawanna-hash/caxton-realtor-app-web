// components/SwipeBackShell.tsx
//
// Thin wrapper that applies the iOS-style edge-swipe-back gesture to the
// page contents. Dropped into the four top-level layouts so every screen
// in the app (admin, portal, dashboard, public) gets the gesture without
// having to wire useSwipeBack into 112 individual page files.
//
// Behavior:
//   - User presses inside the leftmost ~24 px and drags right → page
//     follows the finger, releases past a threshold → router.back().
//   - If there's no history (new tab, direct landing), we fall back to
//     the area's "home" path so the user never strands on an empty back.
//   - Disabled on routes that own horizontal gestures (magazine reader)
//     or where back makes no sense (login, error).
//   - Disabled on the dashboard, which already wires useSwipeBack itself
//     onto its own scroller \u2014 stacking two would race for the gesture.

'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useSwipeBack } from '@/hooks/use-swipe-back';
import { haptics } from '@/lib/native/haptics';

type Area = 'admin' | 'portal' | 'dashboard' | 'public';

interface Props {
  area: Area;
  children: React.ReactNode;
}

// Per-area home path. Used as the fallback when router.back() has no
// previous entry (e.g. user opened the page in a fresh tab).
const FALLBACK: Record<Area, string> = {
  admin: '/admin',
  portal: '/portal',
  dashboard: '/dashboard',
  public: '/',
};

// Paths where we DO NOT want shell-level swipe-back to fire.
// Match by prefix.
const DISABLED_PREFIXES = [
  '/magazine/',          // MagazineReader uses horizontal swipes for page nav
  '/admin/login',        // entry point, no useful back
  '/admin/forgot-password',
  '/admin/reset-password',
  '/portal/error',
  '/dashboard',          // dashboard wires useSwipeBack itself
];

function isDisabled(pathname: string | null): boolean {
  if (!pathname) return true;
  return DISABLED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export default function SwipeBackShell({ area, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  // Track whether this session has any in-app navigation history. We can't
  // read window.history.length reliably (it includes the entries from the
  // previous origin, and SPA navigation always increments it by 1 on first
  // mount). Instead we count pathname changes ourselves: if the count is
  // >= 2, there's a real previous in-app page to go back to.
  const navCountRef = useRef(0);
  useEffect(() => {
    navCountRef.current += 1;
  }, [pathname]);

  const onBack = useCallback(() => {
    if (navCountRef.current >= 2) {
      router.back();
    } else {
      router.push(FALLBACK[area]);
    }
  }, [router, area]);

  // Light haptic the moment the swipe commits — matches iOS Mail / Messages.
  const onCommit = useCallback(() => {
    void haptics.light();
  }, []);

  const disabled = isDisabled(pathname);
  const { ref, style } = useSwipeBack({ onBack, onCommit, disabled });

  // The ref must attach to the element receiving the touch + transform.
  // We wrap children in a div that fills the viewport so the gesture
  // catches anywhere on the page (not just the immediate content area).
  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      style={style}
      // h-full + relative so transform doesn't break sticky descendants
      className="min-h-screen w-full relative"
    >
      {children}
    </div>
  );
}
