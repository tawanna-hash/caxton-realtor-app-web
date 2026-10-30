'use client';

// Splash / Welcome (premium, app-wide). Full-screen sponsor moment on the
// first app open of the day; never shown twice within 12 hours. Supports
// image or video creatives via <AdSlot> (video autoplays muted, inline).
// Only appears when a live campaign exists for the current publication.

import { useEffect, useState } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import { usePublication } from '@/lib/use-publication';

const KEY = 'rnn_splash_welcome_last';
const COOLDOWN_MS = 12 * 60 * 60 * 1000;
const SKIP_AFTER_MS = 3000;
const AUTO_CLOSE_MS = 11000;

export function SplashWelcomeAd() {
  const { pub } = usePublication();
  const [open, setOpen] = useState(false);
  const [canSkip, setCanSkip] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const last = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - last < COOLDOWN_MS) return;
    let cancelled = false;
    fetch(`/api/ads/active?slot=splash_welcome&pub=${pub}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled || !body?.ad) return;
        localStorage.setItem(KEY, String(Date.now()));
        setOpen(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pub]);

  useEffect(() => {
    if (!open) return;
    const s = setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    const c = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => {
      clearTimeout(s);
      clearTimeout(c);
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored welcome"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
    >
      <span className="absolute left-4 top-[calc(16px+env(safe-area-inset-top,0px))] rounded bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wider text-white">
        Sponsored
      </span>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={!canSkip}
        className="absolute right-4 top-[calc(12px+env(safe-area-inset-top,0px))] min-h-11 rounded-full bg-white/20 px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {canSkip ? 'Skip' : 'Skip in 3s'}
      </button>
      <div className="w-full max-w-[min(100vw,56.25vh)]">
        <AdSlot slug="splash_welcome" variant="bare" />
      </div>
    </div>
  );
}
