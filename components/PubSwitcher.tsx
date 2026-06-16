'use client';

import { type PubKey } from '@/lib/pub-meta';

// components/PubSwitcher.tsx
//
// Inline publication switcher pill-pair. Mirrors the implicit publication
// toggle used on /magazine (where tapping the badge cycles publications)
// but exposes both pubs side by side so the user can see which one is
// active and switch with a single tap. Used on /calendar and any other
// publication-scoped public page that needs an explicit switcher.
//
// Writes the same caxton_pub cookie + localStorage mirror that AppShell
// reads and dispatches the savedPubChange event so listening components
// re-render without a page reload. CalendarClient's pub effect already
// re-fetches events when `pub` changes via usePublication, so the
// transition is smooth.

import { useCallback } from 'react';

type Pub = PubKey;

const PUBS: { id: Pub; label: string; color: string }[] = [
  { id: 'realtyline', label: 'RealtyLine Austin', color: '#021D40' },
  { id: 'newsline',   label: 'Newsline San Antonio',       color: '#3D0740' },
];

export function PubSwitcher({ current }: { current: string }) {
  const onPick = useCallback((next: Pub) => {
    if (next === current) return;
    try {
      const maxAge = 60 * 60 * 24 * 365;
      document.cookie = `caxton_pub=${next}; path=/; max-age=${maxAge}; SameSite=Lax`;
      localStorage.setItem('caxton_pub', next);
      localStorage.removeItem('caxton_selected_article');
      localStorage.removeItem('caxton_selected_event');
      window.dispatchEvent(new Event('savedPubChange'));
    } catch {}
  }, [current]);

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
        {PUBS.map((p) => {
          const active = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              aria-pressed={active}
              aria-label={`Switch to ${p.label}`}
              className="text-xs uppercase tracking-[0.15em] font-medium px-3 py-1.5 rounded-md transition-colors border"
              style={{
                color: active ? '#ffffff' : '#4b5563',
                backgroundColor: active ? p.color : '#ffffff',
                borderColor: active ? p.color : '#d1d5db',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
