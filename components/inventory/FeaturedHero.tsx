'use client';

import type { BuilderInventoryRow } from '@/lib/builder-inventory';

type Props = {
  row: BuilderInventoryRow;
  showNav: boolean;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
};

export default function FeaturedHero({ row, showNav, index, total, onPrev, onNext }: Props) {
  const handleOpenFlyer = () => {
    if (row.flyerPdfUrl) {
      window.open(row.flyerPdfUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <section className="relative border border-gray-300 bg-white overflow-hidden">
      {/* Featured ribbon */}
      <div className="absolute top-0 left-0 z-10">
        <span className="inline-block bg-gray-900 text-white text-[10px] uppercase tracking-[0.15em] font-medium px-3 py-1.5">
          Featured
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {/* Thumbnail */}
        <button
          type="button"
          onClick={handleOpenFlyer}
          className="relative aspect-[4/3] md:aspect-auto md:min-h-[360px] bg-gray-100 overflow-hidden focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          aria-label={`Open flyer for ${row.title}`}
        >
          {row.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.thumbnailUrl}
              alt={`${row.builderName} — ${row.title}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-gray-400 bg-gray-50">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
                <circle cx="8.5" cy="10" r="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 17.25 15.75 12 6 19.5" />
              </svg>
              <p className="text-xs uppercase tracking-[0.2em] font-medium text-gray-500">
                Photo coming soon
              </p>
            </div>
          )}
        </button>

        {/* Content */}
        <div className="flex flex-col justify-between p-6 md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
              {row.builderName}
            </p>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-900 tracking-tight mb-2 leading-snug">
              {row.title}
            </h2>
            <p className="text-sm text-gray-600 font-light mb-4">
              {row.city}, {row.state}
            </p>

            {row.description && (
              <p className="text-base text-gray-700 font-light leading-relaxed line-clamp-4 mb-4">
                {row.description}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleOpenFlyer}
              className="self-start inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white tracking-wide bg-gray-900 hover:bg-gray-800 transition-colors"
            >
              View flyer
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </button>

            {showNav && (
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={onPrev}
                  aria-label="Previous featured"
                  className="p-2 border border-gray-300 hover:border-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onNext}
                  aria-label="Next featured"
                  className="p-2 border border-gray-300 hover:border-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <span className="text-xs text-gray-500 font-medium">
                  {index + 1} of {total}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
