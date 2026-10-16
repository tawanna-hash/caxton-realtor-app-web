'use client';

import { Lato } from 'next/font/google';
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
  return (
    <div className={lato.variable}>
      <AppShell variant="admin">
        {children}
      </AppShell>
    </div>
  );
}
