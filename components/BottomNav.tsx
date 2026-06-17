'use client';

// components/BottomNav.tsx
//
// Fixed bottom tab bar: Feed / Magazine / Calendar / Builders / Advertisers / More.
// Rendered by AppShell on every public-variant page and by the dashboard
// (which doesn't use AppShell) in place of its prior inline nav.
//
// Tab semantics:
//   Feed      route-then-dispatch to /dashboard news phase
//   Magazine  push to /magazine (real route, built in S23)
//   Calendar  push to /calendar (real list route, built in S20)
//   Builders  push to /builders (real hub route, built in Stage C)
//   Advertisers push to /advertisers (public directory)
//   More      callback to parent which opens NavDrawer
//
// `info` is used only to derive the active-tab accent color from the current
// publication. Paid ad inventory is rendered separately via <AdSlot> from
// AppShell so it can be slot-aware and per-page.
//
// Tap feedback:
//   - Each destination route is prefetched on mount so the next page is
//     already warm when the user taps.
//   - Tapping a tab paints an immediate "pending" active state that lasts
//     until the pathname catches up. Without this, the bar feels frozen
//     for the duration of the navigation because the previous tab stays
//     highlighted until React Router commits.
//   - Buttons have a touch-friendly active:scale-95 + tap-highlight reset
//     so the press itself feels physical on iOS.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { Home, BookOpen, Calendar, Building2, Megaphone, MoreHorizontal } from 'lucide-react';

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

// Destination routes the bar can navigate to. /dashboard isn't included
// because Feed taps usually fire a same-page event rather than a route push.
const PREFETCH_ROUTES = ['/magazine', '/calendar', '/builders', '/advertisers', '/dashboard'] as const;

export default function BottomNav({ info, onMoreClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Pending target while a navigation is in-flight. Painted as active so the
  // user sees instant feedback. Cleared as soon as pathname commits to the
  // target (or any new path).
  const [pending, setPending] = useState<string | null>(null);

  // Warm up the App Router cache for every destination so the first tap on
  // each tab is instant. next/link does this automatically, but BottomNav
  // uses programmatic router.push, so we have to call prefetch ourselves.
  useEffect(() => {
    for (const route of PREFETCH_ROUTES) {
      try {
        router.prefetch(route);
      } catch {
        // prefetch is a perf hint -- failures are non-fatal
      }
    }
  }, [router]);

  // Once the pathname catches up to the pending target (or moves anywhere
  // else), the pending state is stale. We compute the effective pending
  // value during render instead of mirroring pathname into state via an
  // effect, which keeps the active state in sync with zero re-renders.
  const effectivePending =
    pending && (pathname === pending || pathname.startsWith(`${pending}/`)) ? null : pending;

  function matches(targetPrefix: string, exactDashboard = false): boolean {
    if (effectivePending === targetPrefix) return true;
    if (exactDashboard) return pathname === '/dashboard';
    return pathname === targetPrefix || pathname.startsWith(`${targetPrefix}/`);
  }

  const isHome = matches('/dashboard', true);
  const isMagazine = matches('/magazine');
  const isCalendar = matches('/calendar');
  const isBuilders = matches('/builders');
  const isAdvertisers = matches('/advertisers');

  function navigate(target: string) {
    if (pathname === target) return;
    setPending(target);
    // Safety net: if the navigation never completes (back button, blocked
    // by an interstitial, etc.), the optimistic active state would otherwise
    // stick. 1200ms is plenty for a normal route push and short enough that
    // a stranded highlight self-heals quickly.
    window.setTimeout(() => {
      setPending((curr) => (curr === target ? null : curr));
    }, 1200);
    // Wrap in a transition so React keeps the previous screen interactive
    // while the new one streams in -- avoids the brief input-blocked feel.
    startTransition(() => {
      router.push(target);
    });
  }

  function goHome() {
    if (pathname === '/dashboard') {
      // Detail value must match the dashboard listener at
      // app/(dashboard)/dashboard/page.tsx, which checks target === 'feed'
      // (the same string used by the Phase enum). Sending anything else
      // makes this tap a silent no-op.
      window.dispatchEvent(new CustomEvent('caxton:nav', { detail: 'feed' }));
      // Clear any phase hash so isHome resolves correctly
      if (window.location.hash) {
        history.replaceState(null, '', '/dashboard');
      }
    } else {
      navigate('/dashboard');
    }
  }

  const accent = info?.color ?? '#021D40';

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 z-40"
      // Extend the white background through the iOS home-indicator strip so
      // it doesn't show through to the underlying page. The tab row inside
      // pads itself up off the indicator with the same env() value.
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Tab row */}
      <div className="flex justify-around py-2 pb-3">
        <Tab label="Feed" active={isHome} accent={accent} onClick={goHome}>
          <Home strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Magazine" active={isMagazine} accent={accent} onClick={() => navigate('/magazine')}>
          <BookOpen strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Calendar" active={isCalendar} accent={accent} onClick={() => navigate('/calendar')}>
          <Calendar strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Builders" active={isBuilders} accent={accent} onClick={() => navigate('/builders')}>
          <Building2 strokeWidth={1.75} size={22} />
        </Tab>
        <Tab label="Advertisers" active={isAdvertisers} accent={accent} onClick={() => navigate('/advertisers')}>
          <Megaphone strokeWidth={1.75} size={22} />
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
      // BUG-12: bump tap target to >=44px (WCAG 2.5.5 / Apple HIG)
      // - active:scale-95 gives a quick "press" feel under the finger
      // - WebkitTapHighlightColor:transparent kills iOS's grey flash so
      //   our own pressed-state is the only thing the user sees
      className="flex flex-col items-center justify-center flex-1 px-1 gap-1 min-h-[44px] transition-transform duration-75 active:scale-95"
      style={{
        color: active ? accent : '#9ca3af',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
      <span className="text-[10px] font-medium uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}
