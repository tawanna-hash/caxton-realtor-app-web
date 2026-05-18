'use client';

// components/BottomNav.tsx
//
// Fixed bottom tab bar: Home / Magazine / Calendar / Builders / More.
// Rendered by AppShell on every public-variant page and by the dashboard
// (which doesn't use AppShell) in place of its prior inline nav.
//
// Tab semantics:
//   Home      route-then-dispatch to /dashboard news phase
//   Magazine  route-then-dispatch to /dashboard magazines phase (via hash)
//   Calendar  route-then-dispatch to /dashboard events phase (via hash)
//   Builders  push to /builders (real hub route, built in Stage C)
//   More      callback to parent which opens NavDrawer
//
// House Ad strip: optional, only renders when info is provided (publication-
// specific surfaces — i.e. dashboard in realtyline/newsline mode). Public
// routes pass info={null} and only get the tab row.

import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, Calendar, Building2, MoreHorizontal } from 'lucide-react';

type PubInfo = {
  name: string;
  color: string;
} | null;

type Props = {
  /** Pub info for the House Ad strip. Pass null to hide the strip. */
  info?: PubInfo;
  /** Called when the More tab is tapped. Parent opens NavDrawer. */
  onMoreClick: () => void;
};

export default function BottomNav({ info, onMoreClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === '/dashboard' && !hasHash('magazines', 'events');
  const isMagazine = pathname === '/dashboard' && hasHash('magazines');
  const isCalendar = pathname === '/dashboard' && hasHash('events');
  const isBuilders = pathname === '/builders' || pathname.startsWith('/builders/');

  function goHome() {
    if (pathname === '/dashboard') {
      window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'news' }));
      // Clear any phase hash so isHome resolves correctly
      if (window.location.hash) {
        history.replaceState(null, '', '/dashboard');
      }
    } else {
      router.push('/dashboard');
    }
  }

  function goMagazine() {
    if (pathname === '/dashboard') {
      window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'magazines' }));
      history.replaceState(null, '', '/dashboard#magazines');
    } else {
      router.push('/dashboard#magazines');
    }
  }

  function goCalendar() {
    if (pathname === '/dashboard') {
      window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'events' }));
      history.replaceState(null, '', '/dashboard#events');
    } else {
      router.push('/dashboard#events');
    }
  }

  function goBuilders() {
    router.push('/builders');
  }

  const accent = info?.color ?? '#1a2a44';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 z-40">
      {/* House Ad strip — only when a specific publication is active */}
      {info ? (
        <a
          href="/advertise"
          className="block px-4 py-3 border-b border-gray-100 hover:bg-gray-50"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-11 h-11 flex-shrink-0 flex flex-col items-center justify-center"
                style={{ backgroundColor: info.color }}
              >
                <span className="text-[8px] uppercase tracking-wider text-white/70 leading-none">House</span>
                <span className="text-[10px] uppercase tracking-wider text-white font-semibold leading-none mt-0.5">Ad</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight truncate">
                  Advertise in {info.name}
                </p>
                <p className="text-xs text-gray-500 font-light leading-snug truncate">
                  Reach 50,000+ Texas real estate pros
                </p>
              </div>
            </div>
            <span
              className="text-xs uppercase tracking-wider font-medium flex-shrink-0"
              style={{ color: info.color }}
            >
              Learn More →
            </span>
          </div>
        </a>
      ) : null}

      {/* Tab row */}
      <div className="flex justify-around py-2 pb-3">
        <Tab label="Home" active={isHome} accent={accent} onClick={goHome}>
          <Home strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Magazine" active={isMagazine} accent={accent} onClick={goMagazine}>
          <BookOpen strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Calendar" active={isCalendar} accent={accent} onClick={goCalendar}>
          <Calendar strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Builders" active={isBuilders} accent={accent} onClick={goBuilders}>
          <Building2 strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="More" active={false} accent={accent} onClick={onMoreClick}>
          <MoreHorizontal strokeWidth={1.75} size={22} />
        </Tab>
      </div>
    </nav>
  );
}

function Tab({
  label,
  active,
  accent,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className="flex flex-col items-center flex-1 px-1 gap-1 transition"
      style={{ color: active ? accent : '#9ca3af' }}
    >
      {children}
      <span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}

/**
 * Check whether window.location.hash matches one of the given phase tokens.
 * Returns false during SSR.
 */
function hasHash(...tokens: string[]): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hash.replace(/^#/, '');
  return tokens.includes(h);
}
