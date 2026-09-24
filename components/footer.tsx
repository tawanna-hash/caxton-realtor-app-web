import Link from 'next/link';
import Image from 'next/image';
import { SocialLinks } from '@/components/SocialLinks';

const featuredPartners = [
  {
    name: 'Austin Title',
    image: '/partners/austin-title.webp',
    width: 480,
    height: 198,
    href: 'https://www.austintitle.com',
  },
  {
    name: 'La Cima',
    image: '/partners/la-cima.webp',
    width: 413,
    height: 240,
    href: 'https://lacimatx.com',
  },
  {
    name: 'Independence Title',
    image: '/partners/independence-title.webp',
    width: 377,
    height: 240,
    href: 'https://www.independencetitle.com/locations/austin/',
  },
  {
    name: 'Santa Rita Ranch',
    image: '/partners/santa-rita-ranch.webp',
    width: 302,
    height: 240,
    href: 'https://santaritaranchaustin.com',
  },
  {
    name: 'KB Home',
    image: '/partners/kb-home.webp',
    width: 240,
    height: 240,
    href: 'https://www.kbhome.com/new-homes-austin',
  },
  {
    name: 'Stewart Title',
    image: '/partners/stewart-title.webp',
    width: 480,
    height: 106,
    href: 'https://www.stewart.com/en/markets/austin',
  },
] as const;

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-28">
        <div className="border-b border-gray-200 pb-8 mb-8">
          <div className="flex items-center gap-3 mb-5">
            <Image
              src="/brand/rnn-logo.jpg"
              alt="Realty News Now"
              width={48}
              height={48}
              className="rounded-md"
            />
            <div>
              <p className="text-sm font-semibold text-gray-900">Realty News Now</p>
              <h2 className="text-xs text-gray-600">Featured advertising partners</h2>
            </div>
          </div>
          <div
            aria-label="Featured advertising partners, scroll horizontally to see all six"
            role="region"
            tabIndex={0}
            className="max-w-4xl overflow-x-auto overscroll-x-contain scroll-smooth snap-x snap-mandatory pb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700"
          >
            <ul className="flex w-max gap-3 sm:gap-4">
              {featuredPartners.map((partner) => (
                <li key={partner.name} className="w-36 sm:w-44 shrink-0 snap-start">
                  <a
                    href={partner.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Visit ${partner.name} (opens in a new tab)`}
                    className="flex h-24 sm:h-28 items-center justify-center rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700"
                  >
                    <Image
                      src={partner.image}
                      alt={partner.name}
                      width={partner.width}
                      height={partner.height}
                      sizes="(max-width: 640px) 120px, 152px"
                      className="max-h-full w-auto max-w-full object-contain"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-2 text-xs text-gray-600">Swipe or scroll to see all partners</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">RealtyLine Austin</h3>
            <p className="text-xs text-gray-600 mb-2">Putting A Face on Real Estate since 1995</p>
            <p className="text-xs text-gray-600 mb-3">Austin, Texas</p>
            <SocialLinks pub="realtyline" variant="footer" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Newsline San Antonio</h3>
            <p className="text-xs text-gray-600 mb-2">Founded 1982, Relaunched 2025</p>
            <p className="text-xs text-gray-600 mb-3">San Antonio, Texas</p>
            <SocialLinks pub="newsline" variant="footer" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Content</h3>
            <ul className="space-y-2 text-xs text-gray-600">
              <li><Link href="/magazine" className="hover:text-gray-900 transition-colors">Issues</Link></li>
              <li><Link href="/calendar" className="hover:text-gray-900 transition-colors">Calendar</Link></li>
              <li><Link href="/builders" className="hover:text-gray-900 transition-colors">Builders</Link></li>
              <li><Link href="/inventory" className="hover:text-gray-900 transition-colors">Inventory &amp; Promotions</Link></li>
              <li><Link href="/giveaways" className="hover:text-gray-900 transition-colors">Giveaways</Link></li>
              <li><Link href="/newsletter" className="hover:text-gray-900 transition-colors">Email</Link></li>
              <li><Link href="/subscribe" className="hover:text-gray-900 transition-colors">Subscribe</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Company</h3>
            <ul className="space-y-2 text-xs text-gray-600">
              <li><Link href="/about" className="hover:text-gray-900 transition-colors">About Us</Link></li>
              <li><Link href="/advertise" className="hover:text-gray-900 transition-colors">Advertise</Link></li>
              <li><Link href="/faq" className="hover:text-gray-900 transition-colors">FAQs</Link></li>
              <li><Link href="/support" className="hover:text-gray-900 transition-colors">Support</Link></li>
              <li><Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-gray-900 transition-colors">Terms of Use</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            &copy; {currentYear} Realty News Now. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
