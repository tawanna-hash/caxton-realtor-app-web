'use client';

import { useState } from 'react';
import NewsletterCTA from '@/components/NewsletterCTA';
import type { PubKey } from '@/lib/pub-meta';

const EDITIONS: { id: PubKey; label: string; city: string }[] = [
  { id: 'realtyline', label: 'RealtyLine', city: 'Austin' },
  { id: 'newsline', label: 'Newsline San Antonio', city: 'San Antonio' },
  { id: 'realtyline-dallas', label: 'RealtyLine Dallas/Ft. Worth', city: 'Dallas / Ft. Worth' },
];

export default function EditionSignup() {
  const [pub, setPub] = useState<PubKey>('realtyline');
  const current = EDITIONS.find((e) => e.id === pub)!;
  return (
    <div>
      <p className="text-sm font-semibold text-gray-900 mb-3">Which edition?</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        {EDITIONS.map((e) => {
          const selected = e.id === pub;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => setPub(e.id)}
              aria-pressed={selected}
              className="text-left border-2 px-4 py-3 rounded-md transition-all"
              style={{
                borderColor: selected ? '#301D5D' : '#d1d5db',
                backgroundColor: selected ? '#301D5D10' : '#ffffff',
              }}
            >
              <p className="text-base font-semibold" style={{ color: selected ? '#301D5D' : '#111827' }}>
                {e.city}
              </p>
            </button>
          );
        })}
      </div>
      <NewsletterCTA
        key={pub}
        publication={pub}
        source={`newsletter_landing_${pub}`}
        variant="card"
        headline={`Get the ${current.label} Weekly Email`}
      />
    </div>
  );
}
