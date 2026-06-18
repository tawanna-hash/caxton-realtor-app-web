'use client';

// SearchBar — Modern News kit pattern.
// Pill-shaped, inset on --surface-2, with leading magnifier icon.

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
};

export default function SearchBar({
  value,
  onChange,
  placeholder = 'Search for article',
  onSubmit,
}: Props) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      className="flex items-center gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] px-4 py-2.5"
    >
      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[var(--text-muted)]"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 border-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
      />
    </form>
  );
}
