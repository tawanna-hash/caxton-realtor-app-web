'use client';

import { Lato } from 'next/font/google';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';

// Admin UI kit typeface. Scoped to the admin layout so public pages do not
// download it. Applied through [data-admin-shell] in app/globals.css.
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-lato',
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  // Pages opened inside a pop-up (iframe with ?embed=1) render without the admin chrome.
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try { setEmbed(window.self !== window.top && new URLSearchParams(window.location.search).get('embed') === '1'); } catch { setEmbed(false); }
  }, []);
  return (
    <div className={lato.variable}>
      <AppShell variant="admin" chromeless={embed}>
        {children}
      </AppShell>
    </div>
  );
}
