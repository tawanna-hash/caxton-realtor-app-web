// app/portal/layout.tsx
//
// Portal layout — separate from /admin. Header shows advertiser name +
// session expiry + logout. If no session, children handle the redirect.
//
// Navigation lives in components/PortalNav.tsx (client component) so the
// active link can be highlighted and a mobile drop-down sheet renders
// below the md: breakpoint.

import Link from 'next/link';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import PortalNav from '@/components/PortalNav';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPortalUser();

  return (
    <div className="min-h-screen bg-white">
      <header className="relative border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/portal" className="flex items-center gap-3">
            <div className="font-serif text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
              RealtyLine portal
            </div>
          </Link>
          {user && (
            <div className="flex items-center gap-4">
              <PortalNav />
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">{user.name}</div>
                <div className="text-xs text-gray-500">{user.company ?? user.email}</div>
              </div>
              <form action="/portal/logout" method="post">
                <button className="text-sm text-gray-500 hover:text-gray-900">Sign out</button>
              </form>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      <footer className="border-t border-gray-200 mt-16">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-gray-500">
          Session-only access. Closing your browser signs you out.
        </div>
      </footer>
    </div>
  );
}
