'use client';

// ArticleHero — Modern News kit pattern.
//
// Full-bleed image (or warm accent gradient) with the article headline overlaid
// in white at the bottom. Optional category pill at top-left, comment count and
// read-time badges, plus an AuthorChip floating in the lower-left.
//
// Rounded on desktop (2xl), edge-to-edge on mobile by default.

import AuthorChip from './AuthorChip';

type Props = {
  imageUrl?: string | null;
  category?: string | null;
  headline: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  authorSecondary?: string | null;
  readTimeMins?: number | null;
  commentCount?: number | null;
  height?: 'md' | 'lg' | 'xl';
  rounded?: boolean;
  accent?: string; // CSS gradient/color used when there is no image
};

const HEIGHTS: Record<NonNullable<Props['height']>, string> = {
  md: 'h-72 md:h-80',
  lg: 'h-80 md:h-[26rem]',
  xl: 'h-96 md:h-[32rem]',
};

export default function ArticleHero({
  imageUrl,
  category,
  headline,
  authorName,
  authorAvatar,
  authorSecondary,
  readTimeMins,
  commentCount,
  height = 'lg',
  rounded = true,
  accent = 'linear-gradient(135deg, #c44a1a 0%, #8b2814 100%)',
}: Props) {
  const heightCls = HEIGHTS[height];
  const roundedCls = rounded ? 'rounded-2xl' : '';

  return (
    <div
      className={`relative w-full ${heightCls} ${roundedCls} overflow-hidden bg-[var(--surface-3)]`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: accent }} />
      )}

      {/* Bottom darkening for headline legibility */}
      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/55 to-transparent" />

      {/* Top row: category + meta badges */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 md:p-6">
        {category ? (
          <span className="rounded-full bg-white/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-800">
            {category}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {typeof readTimeMins === 'number' && (
            <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              {readTimeMins} min read
            </span>
          )}
          {typeof commentCount === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              {commentCount}
            </span>
          )}
        </div>
      </div>

      {/* Bottom stack: headline + author chip */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-4 md:p-6">
        <h1 className="font-serif text-2xl leading-tight text-white md:text-4xl">
          {headline}
        </h1>
        {authorName && (
          <div>
            <AuthorChip
              name={authorName}
              avatarUrl={authorAvatar}
              secondary={authorSecondary}
              variant="overlay"
            />
          </div>
        )}
      </div>
    </div>
  );
}
