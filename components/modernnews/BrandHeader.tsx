'use client';

// BrandHeader — Modern News kit pattern.
//
// Top app bar: brand mark left, theme toggle + avatar right. The mockup shows
// a small "RealtyNews" wordmark and a circular profile photo. We render the
// app's existing brand name and slot a theme toggle next to the avatar.
//
// Stays sticky on scroll so the search/chip bar below feels anchored.

import Link from 'next/link';
import ThemeToggle from '@/components/theme/ThemeToggle';

type Props = {
  brand?: string;
  href?: string;
  avatarUrl?: string | null;
  avatarFallback?: string;
  onAvatarClick?: () => void;
  rightSlot?: React.ReactNode;
};

export default function BrandHeader({
  brand = 'Realty News',
  href = '/',
  avatarUrl,
  avatarFallback = 'A',
  onAvatarClick,
  rightSlot,
}: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 md:px-6">
        <Link
          href={href}
          className="font-serif text-xl tracking-tight text-[var(--text-primary)]"
        >
          {brand}
        </Link>
        <div className="flex items-center gap-2">
          {rightSlot}
          <ThemeToggle />
          {(avatarUrl || avatarFallback) && (
            <button
              type="button"
              onClick={onAvatarClick}
              aria-label="Open profile"
              className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--text-primary)]"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                avatarFallback.slice(0, 1).toUpperCase()
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
