'use client';

/**
 * HeroNewsCard — Happin "Hero card" pattern.
 * Full-bleed image with a bottom gradient overlay, a white category pill,
 * a multi-line white headline, and a source row (avatar + source + time).
 *
 * Layout/shape only — typography stays on the app defaults (Georgia via
 * font-serif for headings is intentionally NOT forced here because the hero
 * sits over imagery; we keep the existing semibold sans treatment used in
 * the feed). Brand colors are preserved by callers passing through styles.
 */
export interface HeroNewsCardProps {
  imageUrl?: string;
  category?: string;
  headline: string;
  source?: string;
  sourceLogo?: string;
  time?: string;
  onClick?: () => void;
}

export default function HeroNewsCard({
  imageUrl,
  category,
  headline,
  source,
  sourceLogo,
  time,
  onClick,
}: HeroNewsCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative block w-full text-left overflow-hidden rounded-2xl h-[260px] md:h-[360px] bg-gray-900 group"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#021D40] to-[#3D0740]" />
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
        {category && (
          <span className="inline-block bg-white text-blue-600 text-xs md:text-sm font-semibold px-3 py-1 rounded-full mb-3">
            {category}
          </span>
        )}
        <h2 className="text-white text-lg md:text-2xl font-semibold leading-snug line-clamp-3 mb-3">
          {headline}
        </h2>
        {(source || time) && (
          <div className="flex items-center gap-2 text-white/90">
            {sourceLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceLogo}
                alt=""
                className="w-[18px] h-[18px] md:w-6 md:h-6 rounded-full object-cover bg-white/20 flex-shrink-0"
                loading="lazy"
              />
            ) : (
              <span className="w-[18px] h-[18px] md:w-6 md:h-6 rounded-full bg-white/30 flex-shrink-0" />
            )}
            {source && <span className="text-xs md:text-sm font-medium truncate">{source}</span>}
            {source && time && <span className="text-xs md:text-sm text-white/60">&middot;</span>}
            {time && <span className="text-xs md:text-sm text-white/80">{time}</span>}
          </div>
        )}
      </div>
    </button>
  );
}
