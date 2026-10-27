import Link from 'next/link';
import { SocialLinks } from '@/components/SocialLinks';
import { FeaturedPartnersCarousel } from '@/components/FeaturedPartnersCarousel';

export function Footer({ showAustinPartners = false }: { showAustinPartners?: boolean }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))]">
        {showAustinPartners && <div className="border-b border-gray-200 pb-8 mb-8">
          <h2 className="mb-4 text-center text-xs font-medium tracking-[0.2em] text-gray-500">
            THANK YOU TO OUR BRAND [12] PLUS PARTNERS
          </h2>
          <FeaturedPartnersCarousel placement="footer" />
        </div>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-6 md:gap-8">
          <div className="col-span-2 md:col-span-1">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">RealtyLine Austin</h2>
            <p className="text-xs text-gray-600 mb-2">Putting A Face on Real Estate since 1995</p>
            <p className="text-xs text-gray-600 mb-3">Austin, Texas</p>
            <SocialLinks pub="realtyline" variant="footer" />
          </div>
          <div className="col-span-2 md:col-span-1">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Newsline San Antonio</h2>
            <p className="text-xs text-gray-600 mb-2">Founded 1982, Relaunched 2025</p>
            <p className="text-xs text-gray-600 mb-3">San Antonio, Texas</p>
            <SocialLinks pub="newsline" variant="footer" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Content</h2>
            <ul className="space-y-0 text-xs text-gray-600">
              <li><Link href="/magazine" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Issues</Link></li>
              <li><Link href="/calendar" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Calendar</Link></li>
              <li><Link href="/builders" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Builders</Link></li>
              <li><Link href="/inventory" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Inventory &amp; Promotions</Link></li>
              <li><Link href="/giveaways" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Giveaways</Link></li>
              <li><Link href="/newsletter" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Email</Link></li>
              <li><Link href="/subscribe" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Subscribe</Link></li>
            </ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Company</h2>
            <ul className="space-y-0 text-xs text-gray-600">
              <li><Link href="/about" className="inline-block py-1.5 hover:text-gray-900 transition-colors">About Us</Link></li>
              <li><Link href="/advertise" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Advertise</Link></li>
              <li><Link href="/faq" className="inline-block py-1.5 hover:text-gray-900 transition-colors">FAQs</Link></li>
              <li><Link href="/support" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Support</Link></li>
              <li><Link href="/privacy" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="inline-block py-1.5 hover:text-gray-900 transition-colors">Terms of Use</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            &copy; {currentYear} Realty News Now. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
