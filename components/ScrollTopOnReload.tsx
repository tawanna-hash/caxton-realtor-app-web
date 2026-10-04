'use client';

import { useEffect } from 'react';

/**
 * After a browser refresh, always start at the top of the page. The page is held at the top until the
 * visitor scrolls, touches or presses a key (or 4 seconds pass), so late content loading can't
 * restore the old position. Back/forward and links are unaffected.
 */
export default function ScrollTopOnReload() {
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    let active = true;
    const stop = () => { active = false; };
    const toTop = () => { if (active && window.scrollY !== 0) window.scrollTo(0, 0); };
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;
    events.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
    toTop();
    const interval = window.setInterval(toTop, 100);
    const end = window.setTimeout(() => { stop(); window.clearInterval(interval); }, 4000);
    return () => {
      stop();
      window.clearInterval(interval);
      window.clearTimeout(end);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, []);
  return null;
}
