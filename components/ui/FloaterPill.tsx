'use client';

// components/ui/FloaterPill.tsx
//
// Shared floating action pill used across detail pages (events, inventory,
// etc.) so the aesthetic and dimensions stay consistent everywhere.
//
// Design tokens (single source of truth):
//   - Container: bg-black/85, backdrop-blur-md, rounded-md
//   - Each button: stacked icon + uppercase label, min-w-[52px]
//   - Icon: 16x16
//   - Label: text-[9px], uppercase, tracking-wider
//
// Positioning is the caller's responsibility — pass a `bottomOffsetClass`
// (e.g. 'bottom-[80px]', 'bottom-[148px]') that clears any sticky CTA / bottom
// nav stacked above the system nav.

import React from 'react';
import Link from 'next/link';

export type FloaterAction = {
  // Stable key used for React key + analytics action name.
  key: string;
  label: string;
  // Inline 16x16 SVG <path>/<circle>/<polyline>/<rect>/<line> children
  // (no <svg> wrapper — FloaterPill renders the wrapper consistently).
  icon: React.ReactNode;
  ariaLabel?: string;
  // Provide exactly ONE of href / onClick. If href is provided and starts
  // with '/', the action renders as a next/link. If href starts with http(s)
  // or '#', it renders as a plain anchor with target="_blank".
  href?: string;
  onClick?: () => void;
  // External link affordance — opens in a new tab when true (default: true
  // for absolute URLs, false otherwise).
  external?: boolean;
};

type Props = {
  actions: FloaterAction[];
  // Tailwind class controlling the vertical offset, e.g. 'bottom-[80px]'.
  // Defaults to 'bottom-[80px]' (clears AppShell BottomNav + safe-area).
  bottomOffsetClass?: string;
};

// BUG-13: bump tap target to >=44px on both axes (WCAG 2.5.5).
const BTN_CLS =
  'flex flex-col items-center justify-center min-w-[52px] min-h-[44px] px-1.5 py-1.5 rounded-md ' +
  'transition-colors text-white/85 hover:text-white active:bg-white/10 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

const LABEL_CLS =
  'text-[9px] uppercase tracking-wider mt-0.5 font-medium whitespace-nowrap';

function IconSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ActionInner({ action }: { action: FloaterAction }) {
  return (
    <>
      <IconSvg>{action.icon}</IconSvg>
      <span className={LABEL_CLS}>{action.label}</span>
    </>
  );
}

export default function FloaterPill({
  actions,
  bottomOffsetClass = 'bottom-[80px]',
}: Props) {
  if (actions.length === 0) return null;
  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none ${bottomOffsetClass}`}
      style={{
        // Respect iOS safe-area on top of the requested offset.
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="pointer-events-auto flex items-stretch gap-1 bg-black/85 backdrop-blur-md rounded-md px-1.5 py-1 shadow-lg">
        {actions.map((action) => {
          const aria = action.ariaLabel ?? action.label;
          if (action.href) {
            const isAbsolute = /^https?:\/\//i.test(action.href);
            const external = action.external ?? isAbsolute;
            if (external) {
              return (
                <a
                  key={action.key}
                  href={action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={action.onClick}
                  aria-label={aria}
                  className={BTN_CLS}
                >
                  <ActionInner action={action} />
                </a>
              );
            }
            return (
              <Link
                key={action.key}
                href={action.href}
                onClick={action.onClick}
                aria-label={aria}
                className={BTN_CLS}
              >
                <ActionInner action={action} />
              </Link>
            );
          }
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              aria-label={aria}
              className={BTN_CLS}
            >
              <ActionInner action={action} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
