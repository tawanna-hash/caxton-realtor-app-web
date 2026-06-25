'use client';

// components/NativeStatusBar.tsx
//
// Route-aware status bar manager. Mounted once at the app shell level.
// On iOS, picks light or dark status bar text to keep it readable against
// whichever route the user is on:
//
//   - Brand purple (dark) bar on: /, /dashboard, /dashboard/* (the hero +
//     dashboard chrome is brand-colored)
//   - Light bar on: everything else (public pages have white headers)
//
// No-op on web.

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isNative } from '@/lib/native/runtime';
import { setStatusBarTheme } from '@/lib/native/status-bar';

function pickTheme(pathname: string | null): 'light' | 'dark' {
  if (!pathname) return 'light';
  // Brand-colored chrome — keep status bar text light.
  if (pathname === '/' || pathname === '/dashboard') return 'light';
  if (pathname.startsWith('/dashboard/')) return 'light';
  // Admin uses its own header but is also dark themed.
  if (pathname.startsWith('/admin')) return 'light';
  // Default: public marketing pages have white chrome.
  return 'dark';
}

export default function NativeStatusBar() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isNative()) return;
    void setStatusBarTheme(pickTheme(pathname));
  }, [pathname]);

  return null;
}
