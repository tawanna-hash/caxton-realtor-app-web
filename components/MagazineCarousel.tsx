'use client';

import { useEffect, useState } from 'react';
import type { Magazine } from '@/lib/magazines';
import { fetchMagazines } from '@/lib/magazines';
import MagazineCard from './MagazineCard';

interface MagazineCarouselProps {
  publication: string;
  brandColor: string;
  onOpen: (m: Magazine) => void;
}

export default function MagazineCarousel({ publication, brandColor, onOpen }: MagazineCarouselProps) {
  const [magazines, setMagazines] = useState<Magazine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMagazines(publication)
      .then((data) => {
        if (!cancelled) {
          setMagazines(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load magazines');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publication]);

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex-shrink-0 w-44 h-60 bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6">
        <p className="text-sm text-red-600">Couldn't load magazines: {error}</p>
      </div>
    );
  }

  if (magazines.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-gray-500">No issues available yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="px-4 pt-6 pb-2 flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Magazine</h2>
        <p className="text-xs uppercase tracking-wider text-gray-400">
          {magazines.length} {magazines.length === 1 ? 'issue' : 'issues'}
        </p>
      </div>
      <div
        className="flex gap-3 overflow-x-auto px-4 pb-6 pt-3"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {magazines.map((m) => (
          <MagazineCard key={m.id} magazine={m} brandColor={brandColor} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
