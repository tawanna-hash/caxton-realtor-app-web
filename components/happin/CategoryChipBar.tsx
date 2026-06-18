'use client';

/**
 * CategoryChipBar — Happin horizontal chip filter.
 * Active chip = filled blue-600 (#006fff). Inactive = white with
 * border-gray-200 (#e7e7e7). Horizontally scrollable, mobile-first.
 *
 * Extracted/unified from the inline chip row previously in the dashboard feed.
 */
export interface CategoryChipBarProps {
  items: string[];
  active: string;
  onChange: (next: string) => void;
  className?: string;
}

export default function CategoryChipBar({
  items,
  active,
  onChange,
  className,
}: CategoryChipBarProps) {
  return (
    <div
      className={
        'flex gap-2 overflow-x-auto px-4 py-3 bg-white border-b border-gray-200' +
        (className ? ' ' + className : '')
      }
      style={{ scrollbarWidth: 'none' }}
    >
      {items.map((c) => {
        const isActive = active === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={isActive}
            // flex-shrink-0 keeps long chips like "Featured Advertisers" from
            // being squeezed by sibling flex children (preserves prior BUG-16 fix).
            className={
              isActive
                ? 'flex-shrink-0 whitespace-nowrap px-4 py-1.5 text-sm font-medium border border-blue-600 bg-blue-600 text-white rounded-full transition-colors'
                : 'flex-shrink-0 whitespace-nowrap px-4 py-1.5 text-sm font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:text-gray-900 rounded-full transition-colors'
            }
          >
            {c}
          </button>
        );
      })}
    </div>
  );
}
