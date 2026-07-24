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
//
// SAFE AREA: On notched iPhones the BottomNav now reserves
// env(safe-area-inset-bottom) at its bottom edge, so the pill must sit
// above (BottomNav height) + (safe-area-inset-bottom). The component adds
// the safe-area inset on top of `bottomOffsetClass` automatically via the
// inline `bottom` style, so callers can keep specifying pixel offsets
// relative to the BottomNav as before.

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
  // Pixel distance to keep between the pill and the top of the BottomNav.
  // The safe-area inset is added on top of this automatically. Defaults to
  // 80px (the historical value used across the app), which clears the
  // current BottomNav with comfortable breathing room.
  bottomOffsetClass?: string;
};

// Extract the pixel value out of a Tailwind arbitrary class like
// 'bottom-[80px]' or 'bottom-[148px]'. Falls back to 80 if the class
// doesn't match the expected shape, so legacy callers keep working.
function parseBottomOffsetPx(cls: string): number {
  const m = cls.match(/bottom-\[(\d+(?:\.\d+)?)px\]/);
  if (!m) return 80;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : 80;
}

// BUG-13: bump tap target to >=44px on both axes (WCAG 2.5.5).
//
// Tap feedback:
//   - active:scale-95 + duration-75 gives an immediate "press" feel under
//     the finger, so the user knows the tap registered even if the target
//     route (mailto:, tel:, external link) takes a moment to open.
//   - active:bg-white/20 brightens on press (was /10 -- nearly invisible).
//   - WebkitTapHighlightColor:transparent (set via inline style) kills the
//     iOS grey flash so only our own pressed state is visible.
const BTN_CLS =
  'flex flex-col items-center justify-center min-w-[52px] min-h-[44px] px-1.5 py-1.5 rounded-md ' +
  'transition-transform duration-75 text-white/85 hover:text-white active:scale-95 active:bg-white/20 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';

const TAP_STYLE: React.CSSProperties = { WebkitTapHighlightColor: 'transparent' };

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
  // Combine the caller-requested offset with the iOS safe-area inset so the
  // pill clears both the BottomNav AND the home-indicator strip on notched
  // iPhones (iPhone X+, including 17 Pro Max).
  const offsetPx = parseBottomOffsetPx(bottomOffsetClass);
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-50 pointer-events-none"
      style={{
        bottom: `calc(${offsetPx}px + env(safe-area-inset-bottom, 0px))`,
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
                  style={TAP_STYLE}
                >
                  <ActionInner action={action} />
                </a>
              );
            }
            return (
              <Link
                key={action.key}
                href={action.href}
                prefetch
                onClick={action.onClick}
                aria-label={aria}
                className={BTN_CLS}
                style={TAP_STYLE}
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
              style={TAP_STYLE}
            >
              <ActionInner action={action} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
