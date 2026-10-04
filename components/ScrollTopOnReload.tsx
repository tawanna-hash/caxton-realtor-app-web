'use client';

import { useEffect } from 'react';

/** After a browser refresh, always start at the top of the page. Back/forward and links are unaffected. */
export default function ScrollTopOnReload() {
  useEffect(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== 'reload') return;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const toTop = () => window.scrollTo(0, 0);
    toTop();
    const timers = [50, 150, 400, 900].map((ms) => window.setTimeout(toTop, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  return null;
}
