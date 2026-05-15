'use client';

// components/builders/BuilderChipStrip.tsx
//
// Horizontal scrollable strip of builder name chips. Each chip routes to
// /builders/[slug] for that builder's dedicated page.
//
// Used on:
//   - Dashboard (under top tabs)
//   - /communities
//   - /inventory (both kind=listing and kind=promotion)

import Link from 'next/link';
import { builderNameToSlug } from '@/lib/builder-slug';

type Props = {
  builders: string[];
  // Optional: highlight the currently-active builder (set on /builders/[slug])
  activeBuilder?: string | null;
};

export default function BuilderChipStrip({ builders, activeBuilder }: Props) {
  if (builders.length === 0) return null;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-medium whitespace-nowrap pr-1">
          By Builder
        </span>
        {builders.map((b) => {
          const slug = builderNameToSlug(b);
          const isActive = activeBuilder === b;
          return (
            <Link
              key={b}
              href={`/builders/${slug}`}
              className={
                isActive
                  ? 'whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-[#1a2a44] bg-[#1a2a44] text-white rounded-md'
                  : 'whitespace-nowrap px-3 py-1.5 text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-gray-500 rounded-md'
              }
            >
              {b}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
