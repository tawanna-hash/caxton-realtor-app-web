'use client';

// AuthorChip — Modern News kit pattern.
//
// A small rounded pill with avatar + author name. Two variants:
//   variant="solid"  — for use on light surfaces (default body backgrounds)
//   variant="overlay" — for use on top of imagery / dark hero overlays
//
// Optional secondary text (date, role, read-time) renders below or after the name.

import Link from 'next/link';

type Props = {
  name: string;
  avatarUrl?: string | null;
  secondary?: string | null;
  href?: string;
  variant?: 'solid' | 'overlay';
  size?: 'sm' | 'md';
};

export default function AuthorChip({
  name,
  avatarUrl,
  secondary,
  href,
  variant = 'solid',
  size = 'md',
}: Props) {
  const isOverlay = variant === 'overlay';
  const isSmall = size === 'sm';

  const wrapper = [
    'inline-flex items-center gap-2 rounded-full',
    isSmall ? 'px-2 py-1' : 'px-2.5 py-1.5',
    isOverlay
      ? 'bg-black/55 text-white backdrop-blur-sm'
      : 'bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-subtle)]',
  ].join(' ');

  const avatarCls = isSmall ? 'h-5 w-5' : 'h-7 w-7';
  const nameCls = [
    'font-medium',
    isSmall ? 'text-[11px]' : 'text-xs',
    isOverlay ? 'text-white' : 'text-[var(--text-primary)]',
  ].join(' ');
  const secCls = [
    isSmall ? 'text-[10px]' : 'text-[11px]',
    isOverlay ? 'text-white/75' : 'text-[var(--text-muted)]',
  ].join(' ');

  const initial = name.trim().slice(0, 1).toUpperCase() || '?';

  const body = (
    <span className={wrapper}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt=""
          className={`${avatarCls} rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${avatarCls} inline-flex items-center justify-center rounded-full ${
            isOverlay ? 'bg-white/20 text-white' : 'bg-[var(--surface-3)] text-[var(--text-secondary)]'
          } text-[10px] font-semibold`}
        >
          {initial}
        </span>
      )}
      <span className="flex flex-col leading-tight">
        <span className={nameCls}>{name}</span>
        {secondary && <span className={secCls}>{secondary}</span>}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-block">
        {body}
      </Link>
    );
  }
  return body;
}
