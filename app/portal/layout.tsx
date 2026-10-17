// app/portal/layout.tsx
//
// Portal layout — separate from /admin. Header shows advertiser name +
// session expiry + logout. If no session, children handle the redirect.
//
// Navigation lives in components/PortalNav.tsx (client component) so the
// active link can be highlighted and a mobile drop-down sheet renders
// below the md: breakpoint.

import { Lato } from 'next/font/google';
import { getCurrentPortalUser } from '@/lib/server/portal-session';
import PortalSidebar from '@/components/PortalSidebar';
import PortalTopBar from '@/components/PortalTopBar';
import SwipeBackShell from '@/components/SwipeBackShell';

export const dynamic = 'force-dynamic';

const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], display: 'swap', variable: '--font-lato' });

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentPortalUser();
  const isNewsline = /san.?antonio|newsline/i.test(user?.publication ?? '');

  return (
    <div data-portal-shell="true" className={`${lato.variable} min-h-screen bg-[#F6F5FB]`}>
      {user?.preview && (
        <div className="bg-[#301D5D] text-white text-sm">
          <div className="px-6 py-2 flex items-center justify-between gap-4">
            <span>Admin preview of {user.name}&apos;s portal. Read-only: nothing you do here is saved or paid.</span>
            <form action="/portal/logout" method="post">
              <button className="rounded-full border border-white/40 px-3 py-1 text-xs font-medium hover:bg-white/10">Exit preview</button>
            </form>
          </div>
        </div>
      )}
      <div className="md:flex md:min-h-screen">
        <PortalSidebar
          logoSrc={isNewsline ? '/brand/newsline-logo.png' : '/brand/realtyline-logo.png'}
          logoAlt={isNewsline ? 'Newsline San Antonio' : 'RealtyLine'}
          name={user?.name ?? null}
          email={user?.email ?? null}
          signedIn={Boolean(user)}
        />
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <PortalTopBar signedIn={Boolean(user)} />
          <div className="min-h-[calc(100vh-8rem)] w-full rounded-3xl border border-[#ECE8F5] bg-white p-6 shadow-sm md:p-10">
            <SwipeBackShell area="portal">{children}</SwipeBackShell>
            <p className="mt-16 text-xs text-gray-500">Session-only access. Closing your browser signs you out.</p>
          </div>
        </main>
      </div>
    </div>
  );
}
