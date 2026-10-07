'use client';

import { useState } from 'react';
import NewsletterCTA from '@/components/NewsletterCTA';
import type { PubKey } from '@/lib/pub-meta';

const EDITIONS: { id: PubKey; label: string; city: string }[] = [
  { id: 'realtyline', label: 'RealtyLine', city: 'Austin' },
  { id: 'newsline', label: 'Newsline San Antonio', city: 'San Antonio' },
];

const COMING_SOON = ['Houston', 'Dallas / Ft. Worth'];

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
                borderColor: selected ? '#005a8f' : '#bbc1c9',
                backgroundColor: selected ? '#301D5D10' : '#ffffff',
              }}
            >
              <p className="text-base font-semibold" style={{ color: selected ? '#005a8f' : '#292a2d' }}>
                {e.city}
              </p>
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 -mt-3" aria-label="Coming soon">
        {COMING_SOON.map((city) => (
          <div
            key={city}
            aria-disabled="true"
            className="border-2 border-dashed border-gray-200 px-4 py-3 rounded-md bg-gray-50 flex items-center justify-between gap-2"
          >
            <p className="text-base font-semibold text-gray-400">{city}</p>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 border border-gray-300 rounded-full px-2 py-0.5 whitespace-nowrap">
              Coming soon
            </span>
          </div>
        ))}
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
