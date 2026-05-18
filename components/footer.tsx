import Link from 'next/link';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">RealtyLine Austin</h3>
            <p className="text-xs text-gray-600 mb-2">Putting A Face on Real Estate since 1995</p>
            <p className="text-xs text-gray-600">Austin, Texas</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Newsline San Antonio</h3>
            <p className="text-xs text-gray-600 mb-2">Founded 1982, Relaunched 2025</p>
            <p className="text-xs text-gray-600">San Antonio, Texas</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Resources</h3>
            <ul className="space-y-2 text-xs text-gray-600">
              <li><Link href="/about" className="hover:text-gray-900 transition-colors">About Us</Link></li>
              <li><Link href="/advertise" className="hover:text-gray-900 transition-colors">Advertise</Link></li>
              <li><Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-gray-900 transition-colors">Terms of Use</Link></li>
              <li><Link href="/faq" className="hover:text-gray-900 transition-colors">FAQs</Link></li>
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
