'use client';

// ChipFilter — Modern News kit pattern.
// Horizontal scrolling pill chips. Active chip filled accent; inactive
// transparent with muted text. Mirrors the "Popular / Trending / Recent"
// row in the kit mockup.

type Props = {
  items: ReadonlyArray<string>;
  active: string;
  onChange: (next: string) => void;
  className?: string;
};

export default function ChipFilter({ items, active, onChange, className = '' }: Props) {
  return (
    <div
      className={`flex gap-6 overflow-x-auto scrollbar-none ${className}`}
      role="tablist"
    >
      {items.map((item) => {
        const isActive = item === active;
        return (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item)}
            className={`flex-shrink-0 pb-2 text-sm font-medium transition-colors ${
              isActive
                ? 'text-[var(--text-primary)] border-b-2 border-[var(--text-primary)]'
                : 'text-[var(--text-muted)] border-b-2 border-transparent'
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
