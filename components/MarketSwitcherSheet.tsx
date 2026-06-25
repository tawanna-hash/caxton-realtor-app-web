'use client';

// components/MarketSwitcherSheet.tsx
//
// iOS HIG-aligned bottom sheet for switching publications. Triggered from the
// header title-as-switcher in AppShell. Mirrors Apple Mail / Notes / Slack
// pattern: the current screen's title IS the switcher, tap to surface a
// list picker as a sheet.
//
// Coming-soon markets surface a secondary "Notify me" CTA that routes to
// '/?notify=<id>' (the existing notify-me sheet on /dashboard). The hard
// reload after switching is intentional — see persistPub() doc.

import { useEffect } from 'react';
import {
  PUB_ACTIVE,
  PUB_COMING_SOON,
  persistPub,
  type PubId,
} from '@/lib/publications';
import { haptics } from '@/lib/native/haptics';

type Props = {
  open: boolean;
  /** Currently selected pub id. Used to render the checkmark. */
  currentPub: string | null;
  onClose: () => void;
};

export default function MarketSwitcherSheet({ open, currentPub, onClose }: Props) {
  // Lock body scroll while open so the underlying page doesn't bleed through.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape (keyboards / external Bluetooth).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (id: PubId) => {
    void haptics.selection();
    persistPub(id);
    // Hard reload to '/' so the entire app re-mounts under the new pub
    // context. Soft setState left stale data on screen (BUG-03).
    window.location.assign('/');
  };

  const handleNotify = (id: string) => {
    void haptics.light();
    onClose();
    window.location.assign(`/?notify=${encodeURIComponent(id)}`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Switch publication"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-2xl shadow-2xl pb-[env(safe-area-inset-bottom)] animate-[sheetUp_220ms_ease-out]"
        style={{
          // Inline animation keyframe so we don't have to touch tailwind config.
          animationName: 'sheetUp',
        }}
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2.5 pb-1">
          <span className="w-9 h-1 rounded-full bg-gray-300" aria-hidden />
        </div>

        {/* Title */}
        <div className="px-5 pt-2 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 text-center">
            Switch publication
          </h2>
        </div>

        {/* Active markets */}
        <ul className="py-1">
          {PUB_ACTIVE.map((p) => {
            const isCurrent = currentPub === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handlePick(p.id)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition"
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
                      isCurrent
                        ? 'bg-[#301D5D] text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {p.monogram}
                  </span>
                  <span className="flex-1 text-base font-medium text-gray-900">
                    {p.label}
                  </span>
                  {isCurrent && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#301D5D"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-label="Current selection"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {/* Coming soon */}
        <div className="border-t border-gray-100 pt-2">
          <p className="px-5 text-[11px] uppercase tracking-[0.15em] text-gray-400 font-medium pb-1">
            Coming soon
          </p>
          <ul className="pb-1">
            {PUB_COMING_SOON.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleNotify(p.id)}
                  className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition"
                >
                  <span className="w-9 h-9 rounded-full bg-gray-50 border border-dashed border-gray-300 text-gray-400 flex items-center justify-center text-xs font-semibold">
                    {p.monogram}
                  </span>
                  <span className="flex-1">
                    <span className="block text-base font-medium text-gray-500">
                      {p.label}
                    </span>
                    <span className="block text-xs text-gray-400">
                      Tap to get notified when it launches
                    </span>
                  </span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Cancel */}
        <div className="px-5 pt-2 pb-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-center text-base font-medium text-[#301D5D] hover:bg-gray-50 rounded-md transition"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Keyframe — scoped here so we don't need a tailwind config tweak. */}
      <style jsx>{`
        @keyframes sheetUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
