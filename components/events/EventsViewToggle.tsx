'use client';

// EventsViewToggle — segmented control for switching between Month and
// Upcoming views on the /calendar route.

import { PUB_META, type PubKey } from '@/lib/pub-meta';

export type EventsView = 'month' | 'upcoming';

interface EventsViewToggleProps {
  pub: PubKey;
  value: EventsView;
  onChange: (v: EventsView) => void;
}

export function EventsViewToggle({ pub, value, onChange }: EventsViewToggleProps) {
  const info = PUB_META[pub] || PUB_META.realtyline;
  return (
    <div className="px-4 pt-3 pb-2 flex justify-center">
      <div className="inline-flex bg-gray-100 rounded-md p-1">
        <button
          onClick={() => onChange('month')}
          aria-pressed={value === 'month'}
          className="px-4 py-1.5 text-xs uppercase tracking-wider font-semibold rounded-md transition-colors"
          style={value === 'month' ? { backgroundColor: info.color, color: 'white' } : { color: '#6b7280' }}
        >
          Month
        </button>
        <button
          onClick={() => onChange('upcoming')}
          aria-pressed={value === 'upcoming'}
          className="px-4 py-1.5 text-xs uppercase tracking-wider font-semibold rounded-md transition-colors"
          style={value === 'upcoming' ? { backgroundColor: info.color, color: 'white' } : { color: '#6b7280' }}
        >
          Upcoming
        </button>
      </div>
    </div>
  );
}
