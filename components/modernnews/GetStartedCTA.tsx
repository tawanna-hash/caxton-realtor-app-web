'use client';

// GetStartedCTA — Modern News kit pattern.
//
// Large rounded pill primary CTA with optional secondary text link below.
// Used on auth / onboarding / walkthrough screens.

import Link from 'next/link';

type Props = {
  label?: string;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  secondaryText?: string;
  secondaryLinkLabel?: string;
  secondaryHref?: string;
  secondaryOnClick?: () => void;
  fullWidth?: boolean;
};

export default function GetStartedCTA({
  label = 'Get Started',
  href,
  onClick,
  loading = false,
  disabled = false,
  secondaryText,
  secondaryLinkLabel,
  secondaryHref,
  secondaryOnClick,
  fullWidth = true,
}: Props) {
  const buttonCls = [
    fullWidth ? 'w-full' : '',
    'inline-flex items-center justify-center gap-2',
    'rounded-full px-8 py-4',
    'bg-[var(--text-primary)] text-[var(--surface-1)]',
    'text-base font-semibold tracking-wide',
    'shadow-[0_10px_30px_-12px_rgba(0,0,0,0.45)]',
    'transition-transform active:scale-[0.98]',
    'disabled:opacity-60 disabled:cursor-not-allowed',
    'hover:opacity-90',
  ].join(' ');

  const content = loading ? (
    <>
      <svg
        className="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
      </svg>
      <span>Please wait…</span>
    </>
  ) : (
    <>
      <span>{label}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </>
  );

  const button = href ? (
    <Link href={href} className={buttonCls}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={buttonCls}
    >
      {content}
    </button>
  );

  return (
    <div className={`flex flex-col items-center gap-4 ${fullWidth ? 'w-full' : ''}`}>
      {button}
      {(secondaryText || secondaryLinkLabel) && (
        <p className="text-sm text-[var(--text-secondary)]">
          {secondaryText}{' '}
          {secondaryLinkLabel && secondaryHref && (
            <Link
              href={secondaryHref}
              className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
            >
              {secondaryLinkLabel}
            </Link>
          )}
          {secondaryLinkLabel && !secondaryHref && (
            <button
              type="button"
              onClick={secondaryOnClick}
              className="font-semibold text-[var(--text-primary)] underline-offset-4 hover:underline"
            >
              {secondaryLinkLabel}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
