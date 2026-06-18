'use client';

/**
 * ArticleRow — Happin "Article row" pattern.
 * Text column on the left, 96x96 rounded-12 thumbnail on the right.
 * - 12px blue uppercase category eyebrow
 * - 2-line semibold headline (sans, matches existing feed treatment)
 * - source + time row with a small circular avatar
 *
 * Shape/layout only. No verbiage is generated here — all text comes from props.
 */
export interface ArticleRowProps {
  imageUrl?: string;
  category?: string;
  headline: string;
  source?: string;
  sourceLogo?: string;
  time?: string;
  onClick?: () => void;
}

export default function ArticleRow({
  imageUrl,
  category,
  headline,
  source,
  sourceLogo,
  time,
  onClick,
}: ArticleRowProps) {
  const content = (
    <div className="flex items-start gap-4">
      <div className="flex-1 min-w-0">
        {category && (
          <span className="block text-xs uppercase tracking-[0.15em] font-semibold text-blue-600 mb-1.5">
            {category}
          </span>
        )}
        <h3 className="text-sm md:text-base text-gray-900 leading-snug font-semibold line-clamp-2 mb-2">
          {headline}
        </h3>
        {(source || time) && (
          <div className="flex items-center gap-2 text-gray-500">
            {sourceLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceLogo}
                alt=""
                className="w-[18px] h-[18px] rounded-full object-cover bg-gray-100 flex-shrink-0"
                loading="lazy"
              />
            ) : null}
            {source && <span className="text-xs md:text-sm font-light truncate">{source}</span>}
            {source && time && <span className="text-xs text-gray-300">&middot;</span>}
            {time && <span className="text-xs md:text-sm font-light text-gray-400">{time}</span>}
          </div>
        )}
      </div>
      {imageUrl && (
        <div className="flex-shrink-0 w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left px-4 py-5 hover:bg-gray-50 transition-colors"
      >
        {content}
      </button>
    );
  }
  return <div className="px-4 py-5">{content}</div>;
}
