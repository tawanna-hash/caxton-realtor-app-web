'use client';

import type { Magazine } from '@/lib/magazines';

interface MagazineCardProps {
  magazine: Magazine;
  brandColor: string;
  onOpen: (m: Magazine) => void;
}

export default function MagazineCard({ magazine, brandColor, onOpen }: MagazineCardProps) {
  return (
    <button
      onClick={() => onOpen(magazine)}
      className="flex-shrink-0 w-44 group block text-left"
      aria-label={`Open ${magazine.issue_label}`}
    >
      <div
        className="relative w-44 h-60 overflow-hidden shadow-md group-active:shadow-sm transition-shadow"
        style={{ backgroundColor: brandColor }}
      >
        {magazine.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={magazine.cover_url}
            alt={`${magazine.issue_label} cover`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-white/60 text-xs uppercase tracking-wider">
            No cover
          </div>
        )}
      </div>
      <div className="mt-2">
        <p className="text-xs uppercase tracking-wider text-gray-500 font-medium">
          {magazine.issue_label}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{magazine.page_count} pages</p>
      </div>
    </button>
  );
}
