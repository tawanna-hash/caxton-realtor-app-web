'use client';

// Empty-state shown on every content surface (feed, events, magazine,
// advertisers, profile, social) when the active publication is a
// pre-launch market that hasn't been populated yet (e.g. RealtyLine Houston,
// RealtyLine Dallas as of Phase 2 PR A).
//
// Usage:
//   import { PreLaunchEmptyState } from '@/components/PreLaunchEmptyState';
//   import { isPreLaunchPub } from '@/lib/pub-meta';
//   if (isPreLaunchPub(pub)) return <PreLaunchEmptyState pub={pub} />;

import { PUB_META, type PubKey } from '@/lib/pub-meta';

export function PreLaunchEmptyState({
  pub,
  surface,
  className = '',
}: {
  pub: PubKey;
  // Optional surface label - appended to the headline so users see
  // "No news yet" / "No events yet" etc when context helps.
  surface?: string;
  className?: string;
}) {
  const meta = PUB_META[pub];
  const headline = surface
    ? `No ${surface} yet for ${meta.name}`
    : `${meta.name} is launching soon`;
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-16 px-6 ${className}`}
      data-pre-launch-empty-state
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ backgroundColor: meta.color }}
      >
        <span className="text-white text-xl font-semibold">
          {meta.city.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">{headline}</h3>
      <p className="text-gray-600 max-w-sm">Content launches soon. Check back!</p>
    </div>
  );
}
