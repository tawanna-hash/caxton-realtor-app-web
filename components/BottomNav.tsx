'use client';

// components/BottomNav.tsx
//
// Fixed bottom tab bar: Feed / Magazine / Calendar / Builders / More.
// Rendered by AppShell on every public-variant page and by the dashboard
// (which doesn't use AppShell) in place of its prior inline nav.
//
// Tab semantics:
//   Feed      route-then-dispatch to /dashboard news phase
//   Magazine  push to /magazine (real route, built in S23)
//   Calendar  push to /calendar (real list route, built in S20)
//   Builders  push to /builders (real hub route, built in Stage C)
//   More      callback to parent which opens NavDrawer
//
// `info` is used only to derive the active-tab accent color from the current
// publication. Paid ad inventory is rendered separately via <AdSlot> from
// AppShell so it can be slot-aware and per-page.

import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, Calendar, Building2, MoreHorizontal } from 'lucide-react';

type PubInfo = {
  name: string;
  color: string;
} | null;

type Props = {
  /** Pub info used to tint the active tab. Pass null for default navy. */
  info?: PubInfo;
  /** Called when the More tab is tapped. Parent opens NavDrawer. */
  onMoreClick: () => void;
};

export default function BottomNav({ info, onMoreClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const isHome = pathname === '/dashboard' && !hasHash('magazines', 'events');
  const isMagazine = pathname === '/magazine' || pathname.startsWith('/magazine/');
  const isCalendar = pathname === '/calendar' || pathname.startsWith('/calendar/');
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
    router.push('/magazine');
  }

  function goCalendar() {
    router.push('/calendar');
  }

  function goBuilders() {
    router.push('/builders');
  }

  const accent = info?.color ?? '#1a2a44';

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 z-40">
      {/* Tab row */}
      <div className="flex justify-around py-2 pb-3">
        <Tab label="Feed" active={isHome} accent={accent} onClick={goHome}>
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
