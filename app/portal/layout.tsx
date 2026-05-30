// app/portal/layout.tsx
//
// Portal layout — separate from /admin. Header shows advertiser name +
// session expiry + logout. If no session, children handle the redirect.

import Link from 'next/link';
import { getCurrentPortalUser } from '@/lib/server/portal-session';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPortalUser();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/portal" className="flex items-center gap-3">
            <div className="font-serif text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
              RealtyLine portal
            </div>
          </Link>
          {user && (
            <div className="flex items-center gap-4">
              <nav className="hidden md:flex items-center gap-4 text-sm text-gray-600">
                <Link href="/portal" className="hover:text-gray-900">Overview</Link>
                <Link href="/portal/files" className="hover:text-gray-900">Files</Link>
                <Link href="/portal/forms" className="hover:text-gray-900">Forms</Link>
                <Link href="/portal/account" className="hover:text-gray-900">Account</Link>
              </nav>
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
