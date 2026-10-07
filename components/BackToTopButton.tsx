'use client';

// components/BackToTopButton.tsx
//
// Global floating back-to-top arrow. Renders on every page via the root
// layout. Appears after the user scrolls down 400px and smooth-scrolls
// to top on click. Styled in brand purple (#301D5D).
//
// Hidden on admin pages (path starts with /admin) where floating overlays
// would interfere with tables and forms.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const BRAND_PURPLE = '#301D5D';
const SCROLL_THRESHOLD = 400;

export default function BackToTopButton() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  // Don't render on admin pages.
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    if (isAdmin) return;
    const onScroll = () => setShow(window.scrollY > SCROLL_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isAdmin]);

  if (isAdmin || !show) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-11 h-11 rounded-full shadow-lg transition-opacity hover:opacity-90"
      style={{ backgroundColor: BRAND_PURPLE }}
      aria-label="Back to top"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
