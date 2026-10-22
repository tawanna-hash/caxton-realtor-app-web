'use client';

// components/admin/AdminSidebar.tsx
//
// Persistent left sidebar for the admin dashboard (desktop, lg+ only).
// Replaces the old horizontal dropdown nav bar in AppShell's header.
// Collapsible: expanded shows group + link labels, collapsed shows just
// group icons (labels on hover via title attr). Collapse state persists
// in localStorage so it survives navigation and reloads.
//
// Mobile is untouched — NavDrawer still owns the off-canvas menu there.

import { useCallback, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  DollarSign,
  Mail,
  Megaphone,
  Newspaper,
  BarChart3,
  ShieldCheck,
  ClipboardCheck,
  FileBarChart,
  CalendarDays,
  BookOpen,
  Globe,
  Building2,
  LayoutDashboard,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from 'lucide-react';
import { ADMIN_NAV, isAdminGroupActive as isGroupActive, type AdminNavGroup } from '@/lib/admin-nav';
// Sidebar order is alphabetical at every level (sections, pages, and nested
// child pages). Other nav surfaces keep the order defined in lib/admin-nav.ts.
const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
// Admin Dashboard is pinned first; every other group stays alphabetical.
const PINNED_FIRST = 'Admin Dashboard';
const PINNED_SECOND = 'Partners';
const pinRank = (l: string) => (l === PINNED_FIRST ? 0 : l === PINNED_SECOND ? 1 : 2);
const ADMIN_GROUPS: AdminNavGroup[] = ADMIN_NAV
  .map((g) => ({ ...g, links: g.label === 'Get Paid' ? [...g.links] : [...g.links].sort(byLabel) }))
  .sort((a, b) => pinRank(a.label) - pinRank(b.label) || byLabel(a, b));

import BetaCountChip from '@/components/admin/BetaCountChip';
import UnreadAdsBadge from '@/components/UnreadAdsBadge';
import BillingAlertsBadge from '@/components/BillingAlertsBadge';
import PendingGmailBadge from '@/components/PendingGmailBadge';

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'Admin Dashboard': LayoutDashboard,
  Partners: Users,
  Sales: Users,
  'Get Paid': DollarSign,
  Beta: DollarSign,
  'Mailing List HUB': Mail,
  'Ad Ops': Megaphone,
  Content: Newspaper,
  'Print Issue': BookOpen,
  Website: Globe,
  Builders: Building2,
  'Calendar Events': CalendarDays,
  'Market Reports': FileBarChart,
  'Closing Time': ClipboardCheck,
  Insights: BarChart3,
  Team: ShieldCheck,
};

const COLLAPSE_KEY = 'caxton_admin_sidebar_collapsed';

function GroupBadge({ group }: { group: AdminNavGroup }) {
  if (group.links.some((l) => l.href === '/admin/ads/inquiries')) return <UnreadAdsBadge />;
  if (group.links.some((l) => l.href === '/admin/agreements')) return <BillingAlertsBadge />;
  if (group.links.some((l) => l.href === '/admin/events/gmail')) return <PendingGmailBadge />;
  return null;
}

function InlineBadge({ href }: { href: string }) {
  if (href === '/admin/ads/inquiries') return <UnreadAdsBadge variant="inline" />;
  if (href === '/admin/agreements') return <BillingAlertsBadge variant="inline" />;
  if (href === '/admin/events/gmail') return <PendingGmailBadge variant="inline" />;
  return null;
}

export default function AdminSidebar() {
  const pathname = usePathname();

  // Lazy initializer reads localStorage once, synchronously, on first
  // render — no effect needed, so no post-mount flash and no
  // cascading-render lint violation. Next.js admin routes are all
  // client-rendered behind auth, so there's no SSR/hydration mismatch
  // to worry about here.
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  // Which groups are manually toggled open/closed by the user, keyed by
  // group label. A group not present here falls back to whether it's the
  // active route's group (see `isOpen` below) — so navigating to a new
  // section auto-expands it without needing a state-syncing effect.
  const [manualOpen, setManualOpen] = useState<Map<string, boolean>>(new Map());

  const activeGroupLabel = useMemo(
    () => ADMIN_GROUPS.find((g) => isGroupActive(g, pathname))?.label,
    [pathname],
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  // Toggling a group records an explicit true/false override in
  // `manualOpen`, taking precedence over the active-route default below.
  const toggleGroup = useCallback((label: string) => {
    setManualOpen((prev) => {
      const next = new Map(prev);
      const currentlyOpen = prev.has(label) ? prev.get(label)! : label === activeGroupLabel;
      next.set(label, !currentlyOpen);
      return next;
    });
  }, [activeGroupLabel]);

  return (
    <aside
      className={`hidden lg:flex lg:flex-col shrink-0 sticky top-0 h-screen border-r border-[#ECE8F5] bg-white text-gray-700 transition-[width] duration-150 ${collapsed ? 'w-[4.5rem]' : 'w-64'}`}
      aria-label="Admin navigation"
    >
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/rnn-logo.jpg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl" />
            <span className="text-sm font-semibold tracking-tight text-brand-700 truncate">Realty News Now</span>
          </Link>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`p-2 rounded-lg text-gray-500 hover:text-brand-700 hover:bg-brand-50 transition ${collapsed ? 'mx-auto' : ''}`}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-1 pr-0">
        {ADMIN_GROUPS.map((group) => {
          const Icon = GROUP_ICONS[group.label] ?? Newspaper;
          const isActive = isGroupActive(group, pathname);
          const isOpen = manualOpen.has(group.label)
            ? manualOpen.get(group.label)!
            : group.label === activeGroupLabel;

          if (collapsed) {
            // Collapsed rail: icon-only, click navigates straight to the
            // group's first link (fastest path back to a familiar page).
            return (
              <Link
                key={group.label}
                href={group.links[0].href}
                title={group.label}
                className={`relative flex items-center justify-center mx-2 my-1 h-10 rounded-xl transition ${
                  isActive ? 'bg-brand-100 text-brand-700' : 'text-gray-500 hover:text-brand-700 hover:bg-brand-50'
                }`}
              >
                <Icon size={18} />
                <span className="absolute top-1 right-1">
                  <GroupBadge group={group} />
                </span>
              </Link>
            );
          }

          if (group.links.length === 1) {
            // One-page group (Admin Dashboard): a direct link, no dropdown.
            return (
              <div key={group.label} className="px-2">
                <Link
                  href={group.links[0].href}
                  className={`relative w-full flex items-center gap-3 my-1 px-3 py-2.5 rounded-xl text-[15px] transition ${
                    isActive ? 'bg-brand-100 text-brand-700' : 'text-gray-700 hover:text-brand-700 hover:bg-brand-50'
                  }`}
                >
                  {isActive && (
                    <span aria-hidden="true" className="absolute -left-2 top-0 h-full w-1 rounded-r-full bg-brand-700" />
                  )}
                  <Icon size={18} className="shrink-0" />
                  <span className="flex-1 text-left font-medium">{group.label}</span>
                  <GroupBadge group={group} />
                </Link>
              </div>
            );
          }

          return (
            <div key={group.label} className="px-2">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={isOpen}
                className={`relative w-full flex items-center gap-3 my-1 px-3 py-2.5 rounded-xl text-[15px] transition ${
                  isActive ? 'bg-brand-100 text-brand-700' : 'text-gray-700 hover:text-brand-700 hover:bg-brand-50'
                }`}
              >
                {isActive && (
                  <span aria-hidden="true" className="absolute -left-2 top-0 h-full w-1 rounded-r-full bg-brand-700" />
                )}
                <Icon size={18} className="shrink-0" />
                <span className="flex-1 text-left font-medium">{group.label}</span>
                <GroupBadge group={group} />
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {isOpen && (
                <div className="ml-6 mb-2 pl-3 space-y-1">
                  {group.links.filter((l) => !l.parent).map((link) => {
                    const kids = group.links.filter((l) => l.parent === link.href);
                    const onKid = kids.some((k) => pathname === k.href || pathname.startsWith(k.href + '/'));
                    const linkActive = !onKid && (pathname === link.href || pathname.startsWith(link.href + '/'));
                    return (
                      <div key={link.href}>
                        <Link
                          href={link.href}
                          className={`flex items-center gap-2 py-2 px-3 rounded-lg text-[14px] leading-tight transition ${
                            linkActive
                              ? 'text-brand-700 font-semibold bg-brand-50'
                              : 'text-gray-500 hover:text-brand-700 hover:bg-brand-50'
                          }`}
                        >
                          <span className="truncate">{link.label}</span>
                          <InlineBadge href={link.href} />
                          {group.label === 'Get Paid' && <BetaCountChip href={link.href} />}
                        </Link>
                        {kids.length > 0 && (
                          <div className="ml-4 mt-1 space-y-1">
                            {kids.map((kid) => {
                              const kidActive = pathname === kid.href || pathname.startsWith(kid.href + '/');
                              return (
                                <Link
                                  key={kid.href}
                                  href={kid.href}
                                  className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-[13px] leading-tight transition ${
                                    kidActive
                                      ? 'text-brand-700 font-semibold bg-brand-50'
                                      : 'text-gray-500 hover:text-brand-700 hover:bg-brand-50'
                                  }`}
                                >
                                  <span aria-hidden="true" className="text-gray-300">&#8627;</span>
                                  <span className="truncate">{kid.label}</span>
                                  {group.label === 'Get Paid' && <BetaCountChip href={kid.href} />}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
