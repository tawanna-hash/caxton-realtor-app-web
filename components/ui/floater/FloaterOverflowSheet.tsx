'use client';

// components/ui/floater/FloaterOverflowSheet.tsx
//
// Bottom action sheet for the detail-page floater's secondary actions
// (Flyer, Website, Save, Contact, Directions, Promos, ...). Triggered by the
// "More" pill that useDetailFloaterActions appends when there are overflow
// actions. Mirrors the MarketSwitcherSheet chrome: backdrop, grabber, titled
// header, list rows, Escape + scroll-lock, safe-area padding.
//
// Rows reuse the same FloaterAction objects the pill uses, so href/onClick
// behave identically — internal '/' routes render as next/link, absolute /
// tel: / mailto URLs render as plain anchors.

import Link from 'next/link';
import { useEffect } from 'react';
import type { FloaterAction } from '@/components/ui/FloaterPill';
import { IconSvg } from './icons';

type Props = {
  open: boolean;
  title?: string;
  actions: FloaterAction[];
  onClose: () => void;
};

function isExternalHref(href: string): boolean {
  return (
    /^https?:\/\//i.test(href) ||
    href.startsWith('tel:') ||
    href.startsWith('mailto:')
  );
}

export default function FloaterOverflowSheet({
  open,
  title = 'More',
  actions,
  onClose,
}: Props) {
  // Lock body scroll while the sheet is up so the page underneath doesn't move.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes (keyboards / external Bluetooth).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || actions.length === 0) return null;

  const handle = (action: FloaterAction) => () => {
    action.onClick?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)]">
        {/* Grabber */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden />
        </div>

        {/* Title */}
        <div className="px-5 pt-2 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 text-center">
            {title}
          </h2>
        </div>

        {/* Rows */}
        <ul className="py-1">
          {actions.map((action) => {
            const aria = action.ariaLabel ?? action.label;
            const rowClass =
              'w-full flex items-center gap-3 px-5 py-3.5 text-left text-gray-900 hover:bg-gray-50 active:bg-gray-100 transition';
            const glyph = (
              <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-700">
                <IconSvg size={18}>{action.icon}</IconSvg>
              </span>
            );
            const label = (
              <span className="text-[15px] font-medium">{action.label}</span>
            );
            return (
              <li key={action.key}>
                {action.href ? (
                  isExternalHref(action.href) ? (
                    <a
                      href={action.href}
                      target={action.href.startsWith('http') ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      onClick={handle(action)}
                      aria-label={aria}
                      className={rowClass}
                    >
                      {glyph}
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={action.href}
                      onClick={handle(action)}
                      aria-label={aria}
                      className={rowClass}
                    >
                      {glyph}
                      {label}
                    </Link>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={handle(action)}
                    aria-label={aria}
                    className={rowClass}
                  >
                    {glyph}
                    {label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-5 pb-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-md text-[15px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
