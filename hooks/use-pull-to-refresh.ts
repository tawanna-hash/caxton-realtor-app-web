'use client';

// hooks/use-pull-to-refresh.ts
//
// Lightweight pull-to-refresh for touch devices. Activates only when:
//   - The window is scrolled to the top (scrollY === 0)
//   - The user's finger moves DOWN more than DRAG_START_PX
//
// Returns:
//   - pulling: boolean (is the user actively dragging)
//   - distance: 0..maxDistance (px the finger has pulled)
//   - refreshing: boolean (refresh is in flight)
//   - bind: spread these props on a wrapping <div> for the gesture target
//
// On release past TRIGGER_PX we call onRefresh(). The caller decides when
// the refresh is done by toggling its own state — we expose `armed` so the
// indicator can switch from "Pull to refresh" to "Release to refresh".

import { useCallback, useEffect, useRef, useState } from 'react';

export type PullToRefreshState = {
  pulling: boolean;
  distance: number;
  armed: boolean;
  refreshing: boolean;
};

const TRIGGER_PX = 70;
const MAX_PX = 110;
const DRAG_START_PX = 6;

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const activeRef = useRef(false);

  const finish = useCallback(() => {
    setPulling(false);
    setDistance(0);
    startY.current = null;
    activeRef.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('ontouchstart' in window)) return;

    const onStart = (e: TouchEvent) => {
      if (refreshing) return;
      // Only engage when scrolled to top.
      if (window.scrollY > 0) return;
      const t = e.touches[0];
      if (!t) return;
      startY.current = t.clientY;
      activeRef.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!activeRef.current || startY.current == null) return;
      if (refreshing) return;
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - startY.current;
      // Cancel engagement if user starts scrolling up first.
      if (dy < 0) {
        finish();
        return;
      }
      if (dy > DRAG_START_PX) {
        // Apply rubber-band easing so it never tracks 1:1 beyond the cap.
        const eased = Math.min(MAX_PX, dy * 0.55);
        setPulling(true);
        setDistance(eased);
        // Block native scroll while we own the gesture.
        if (e.cancelable) e.preventDefault();
      }
    };

    const onEnd = () => {
      if (!activeRef.current) return;
      const armed = distance >= TRIGGER_PX;
      if (armed && !refreshing) {
        setRefreshing(true);
        setPulling(false);
        setDistance(TRIGGER_PX); // hold the indicator while loading
        Promise.resolve(onRefresh())
          .catch(() => {
            /* swallow — the caller already surfaces errors */
          })
          .finally(() => {
            // Min visible duration so the indicator doesn't flicker on
            // sub-100ms refetches; spec says ~600ms reads as a "refresh".
            window.setTimeout(() => {
              setRefreshing(false);
              setDistance(0);
              activeRef.current = false;
              startY.current = null;
            }, 600);
          });
      } else {
        finish();
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [refreshing, distance, onRefresh, finish]);

  return {
    pulling,
    distance,
    armed: distance >= TRIGGER_PX,
    refreshing,
  } satisfies PullToRefreshState;
}
