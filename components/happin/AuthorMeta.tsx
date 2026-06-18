'use client';

/**
 * AuthorMeta — Happin author meta row for the article detail screen.
 * Avatar circle + name + date + optional read-time.
 *
 * Avatars that 404 (e.g. missing Gravatar) hide themselves to avoid a broken
 * image icon, matching the prior inline byline behavior.
 */
export interface AuthorMetaProps {
  name?: string;
  avatar?: string;
  date?: string;
  readTime?: string;
  className?: string;
}

export default function AuthorMeta({
  name,
  avatar,
  date,
  readTime,
  className,
}: AuthorMetaProps) {
  if (!name && !date && !readTime) return null;

  return (
    <div className={'flex items-center gap-3' + (className ? ' ' + className : '')}>
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt=""
          width={96}
          height={96}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
          className="w-11 h-11 rounded-full object-cover bg-gray-100 flex-shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        {name && (
          <p className="text-sm text-gray-900 font-medium leading-tight">By {name}</p>
        )}
        {(date || readTime) && (
          <p className="text-xs text-gray-500 font-light leading-tight mt-0.5">
            {date}
            {date && readTime && <span className="text-gray-300"> &middot; </span>}
            {readTime}
          </p>
        )}
      </div>
    </div>
  );
}
