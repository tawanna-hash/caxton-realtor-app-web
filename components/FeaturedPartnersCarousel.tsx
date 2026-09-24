'use client';

import Image from 'next/image';

const partners = [
  { name: 'Austin Title', image: '/partners/austin-title.webp', width: 480, height: 198, href: 'https://www.austintitle.com' },
  { name: 'La Cima', image: '/partners/la-cima.webp', width: 413, height: 240, href: 'https://lacimatx.com' },
  { name: 'Independence Title', image: '/partners/independence-title.webp', width: 377, height: 240, href: 'https://www.independencetitle.com/locations/austin/' },
  { name: 'Santa Rita Ranch', image: '/partners/santa-rita-ranch.webp', width: 302, height: 240, href: 'https://santaritaranchaustin.com' },
  { name: 'KB Home', image: '/partners/kb-home.webp', width: 240, height: 240, href: 'https://www.kbhome.com/new-homes-austin' },
  { name: 'Stewart Title', image: '/partners/stewart-title.webp', width: 480, height: 106, href: 'https://www.stewart.com/en/markets/austin' },
] as const;

export function FeaturedPartnersCarousel({ placement }: { placement: 'top' | 'footer' }) {
  const top = placement === 'top';
  return (
    <section
      aria-label="Featured advertising partners"
      className={top ? 'border-b border-gray-200 bg-white py-3 sm:py-4' : ''}
    >
      <div className={top ? 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8' : ''}>
        {top && (
          <div className="mb-2 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-700" aria-hidden="true" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-700">Featured partners</h2>
          </div>
        )}
        <div className="partner-carousel overflow-hidden" aria-label="Partner logos advance automatically">
          <div className="partner-carousel-track flex w-max">
            {[false, true].map((duplicate) => (
              <ul
                key={String(duplicate)}
                aria-hidden={duplicate ? 'true' : undefined}
                inert={duplicate ? true : undefined}
                className="flex shrink-0 gap-3 pr-3 sm:gap-4 sm:pr-4"
              >
                {partners.map((partner) => (
                  <li key={partner.name} className={top ? 'w-36 shrink-0 sm:w-44' : 'w-40 shrink-0 sm:w-48'}>
                    <a
                      href={partner.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Visit ${partner.name} (opens in a new tab)`}
                      className={`flex items-center justify-center rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${top ? 'h-20 sm:h-24' : 'h-24 sm:h-28'}`}
                    >
                      <Image
                        src={partner.image}
                        alt={partner.name}
                        width={partner.width}
                        height={partner.height}
                        sizes="(max-width: 640px) 136px, 176px"
                        className="max-h-full w-auto max-w-full object-contain"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <style jsx>{`
        .partner-carousel-track {
          animation: partner-scroll 32s linear infinite;
        }
        .partner-carousel:hover .partner-carousel-track,
        .partner-carousel:focus-within .partner-carousel-track {
          animation-play-state: paused;
        }
        @keyframes partner-scroll {
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .partner-carousel { overflow-x: auto; }
          .partner-carousel-track { animation: none; }
        }
      `}</style>
    </section>
  );
}
