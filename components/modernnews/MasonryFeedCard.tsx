'use client';

// MasonryFeedCard — Modern News kit pattern.
//
// Tall image card with rounded corners, the article headline overlaid on the
// bottom with a soft gradient. An author chip floats at the bottom-left
// (avatar + name in a pill). Designed to live in a 2-column masonry grid;
// pass `height` as 'sm' | 'md' | 'lg' to stagger heights for the masonry feel.

import Link from 'next/link';

type Props = {
  imageUrl?: string | null;
  category?: string | null;
  headline: string;
  authorName?: string | null;
  authorAvatar?: string | null;
  readTimeMins?: number | null;
  href?: string;
  onClick?: () => void;
  height?: 'sm' | 'md' | 'lg';
  imageAccent?: string;
};

const HEIGHTS: Record<NonNullable<Props['height']>, string> = {
  sm: 'h-44 md:h-56',
  md: 'h-56 md:h-72',
  lg: 'h-72 md:h-96',
};

export default function MasonryFeedCard({
  imageUrl,
  category,
  headline,
  authorName,
  authorAvatar,
  readTimeMins,
  href,
  onClick,
  height = 'md',
  imageAccent = 'linear-gradient(135deg, #c44a1a 0%, #a8351c 100%)',
}: Props) {
  const heightCls = HEIGHTS[height];

  const body = (
    <div
      className={`relative w-full ${heightCls} overflow-hidden rounded-2xl bg-[var(--surface-3)]`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: imageAccent }} />
      )}
      {/* Gradient to anchor text bottom */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      {/* Top-right: read-time chip */}
      {typeof readTimeMins === 'number' && (
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-800">
          {readTimeMins} min read
        </span>
      )}

      {/* Bottom stack: category, headline, author chip */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3.5">
        {category && (
          <span className="self-start rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-800">
            {category}
          </span>
        )}
        <h3 className="font-serif text-base leading-snug text-white md:text-lg line-clamp-3">
          {headline}
        </h3>
        {authorName && (
          <div className="mt-1 inline-flex items-center gap-2 self-start rounded-full bg-black/55 px-2 py-1 backdrop-blur-sm">
            {authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={authorAvatar}
                alt=""
                className="h-5 w-5 rounded-full object-cover"
              />
            ) : (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-semibold text-white">
                {authorName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-[11px] font-medium text-white">
              {authorName}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  if (href) return <Link href={href} className="block">{body}</Link>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return body;
}
