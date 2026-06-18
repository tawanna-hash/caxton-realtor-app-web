'use client';

/**
 * CategoryGridCard — Happin "Categories" grid tile.
 * Square card with a cover image, a bottom gradient, and a white label.
 * Built for Stage B index pages (Builders / Advertisers / Magazine, etc.).
 *
 * Shape/layout only — label text is provided by the caller.
 */
export interface CategoryGridCardProps {
  imageUrl?: string;
  label: string;
  onClick?: () => void;
  className?: string;
}

export default function CategoryGridCard({
  imageUrl,
  label,
  onClick,
  className,
}: CategoryGridCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'relative block w-full text-left overflow-hidden rounded-2xl aspect-square bg-gray-900 group' +
        (className ? ' ' + className : '')
      }
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

      {/* Bottom gradient for label legibility */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-3 md:p-4">
        <span className="text-white text-sm md:text-base font-semibold leading-snug line-clamp-2">
          {label}
        </span>
      </div>
    </button>
  );
}
