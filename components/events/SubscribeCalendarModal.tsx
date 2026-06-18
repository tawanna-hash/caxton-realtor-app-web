'use client';

// Subscribe-to-calendar modal. Renders four options for adding the events
// feed to a user's personal calendar:
//   - Google Calendar (cid= deep link)
//   - Apple Calendar  (webcal:// — macOS/iOS hand it to Calendar.app)
//   - Outlook         (Outlook web add-subscription URL)
//   - Copy feed URL   (works with any iCal-compatible client)
//
// The feed itself is served from /api/events/<market>/ics.

import { useEffect, useMemo, useState } from 'react';
import type { PubKey } from '@/lib/pub-meta';
import { trackEvent } from '@/app/posthog-provider';

interface Props {
  open: boolean;
  onClose: () => void;
  pub: PubKey;
}

function getFeedUrls(market: 'austin' | 'san_antonio'): {
  https: string;
  webcal: string;
} {
  // Build off window.location at render time so the URL works in any
  // environment (preview deploys, production, localhost).
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://realtynewsnow.app';
  const path = `/api/events/${market}/ics`;
  const https = `${origin}${path}`;
  const webcal = `webcal://${origin.replace(/^https?:\/\//, '')}${path}`;
  return { https, webcal };
}

export function SubscribeCalendarModal({ open, onClose, pub }: Props) {
  const market: 'austin' | 'san_antonio' = pub === 'realtyline' ? 'austin' : 'san_antonio';
  const { https, webcal } = useMemo(() => getFeedUrls(market), [market]);
  const [copied, setCopied] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset copy state when modal closes.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      trackEvent('calendar_subscribe_copy', { market });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API: select-all via textarea.
      const ta = document.createElement('textarea');
      ta.value = https;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
  }

  function track(provider: string) {
    trackEvent('calendar_subscribe_click', { market, provider });
  }

  // Google Calendar accepts a cid= parameter pointing at any public ICS URL.
  const googleUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(https)}`;
  // Outlook web add-subscription endpoint.
  const outlookUrl = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(
    https,
  )}&name=${encodeURIComponent('Real Estate Events')}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscribe-modal-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      {/* Card */}
      <div className="relative bg-white w-full max-w-md shadow-xl rounded-md overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-200">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Stay in sync
          </p>
          <h2
            id="subscribe-modal-title"
            className="text-xl text-gray-900 font-light leading-tight"
          >
            Subscribe to this calendar
          </h2>
          <p className="text-sm text-gray-600 font-light leading-relaxed mt-2">
            Add real estate events to your personal calendar. New events appear automatically.
          </p>
        </div>

        {/* Options */}
        <div className="p-4 space-y-2">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('google')}
            className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors rounded-md"
          >
            <span className="flex items-center gap-3">
              <span className="text-base text-gray-900 font-medium">Google Calendar</span>
            </span>
            <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium">
              Open &rarr;
            </span>
          </a>

          <a
            href={webcal}
            onClick={() => track('apple')}
            className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors rounded-md"
          >
            <span className="flex items-center gap-3">
              <span className="text-base text-gray-900 font-medium">Apple Calendar</span>
            </span>
            <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium">
              Add &rarr;
            </span>
          </a>

          <a
            href={outlookUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('outlook')}
            className="flex items-center justify-between w-full px-4 py-3 border border-gray-200 hover:border-gray-900 hover:bg-gray-50 transition-colors rounded-md"
          >
            <span className="flex items-center gap-3">
              <span className="text-base text-gray-900 font-medium">Outlook</span>
            </span>
            <span className="text-xs uppercase tracking-[0.15em] text-gray-500 font-medium">
              Open &rarr;
            </span>
          </a>

          <div className="pt-2">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2 px-1">
              Or any other app
            </p>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={https}
                aria-label="Calendar feed URL"
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 min-w-0 px-3 py-2 text-sm text-gray-700 font-light bg-gray-50 border border-gray-200 rounded-md"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2 text-xs uppercase tracking-[0.15em] font-medium text-white bg-gray-900 hover:bg-gray-800 transition-colors rounded-md whitespace-nowrap"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-500 font-light">
            Updates refresh hourly in your calendar app.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-xs uppercase tracking-[0.15em] text-gray-900 font-medium hover:underline"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
