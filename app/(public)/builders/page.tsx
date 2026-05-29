// app/(public)/builders/page.tsx
//
// Builder / Developer Advertisers hub.
// Reached from the BottomNav "Builders" tab.
//
// Clean, minimal design matching the rest of the app:
// white background, gray-700 typography, simple section header,
// list of three navigational rows (Communities, Move-in Ready, Promotions).
//
// Server component — pure static markup.

import Link from 'next/link';
import { Home, Building2, Tag, ArrowRight } from 'lucide-react';
import PageTitle from '@/components/ui/PageTitle';

export const metadata = {
  title: 'Builder & Developer Advertisers \u2014 Realty News Now',
  description:
    'New home communities, move-in ready homes, and promotions from Austin builders and developers.',
};

type LinkItem = {
  label: string;
  description: string;
  href: string;
  Icon: typeof Home;
};

const LINKS: LinkItem[] = [
  {
    label: 'New Home Communities',
    description: 'Master-planned developments and active community listings.',
    href: '/communities?pub=realtyline',
    Icon: Building2,
  },
  {
    label: 'Move-in Ready Homes',
    description: 'Specific homes available now from builder partners.',
    href: '/inventory?kind=listing&pub=realtyline',
    Icon: Home,
  },
  {
    label: 'Promotions',
    description: 'Current incentives, rate buy-downs, and limited-time offers.',
    href: '/inventory?kind=promotion&pub=realtyline',
    Icon: Tag,
  },
];

export default function BuildersHubPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <header className="mb-8 sm:mb-10">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
            Advertisers
          </p>
          <PageTitle size="md">
            Builders &amp; Developers
          </PageTitle>
          <p className="text-base text-gray-700 font-light leading-relaxed mt-3">
            Explore communities, move-in ready homes, and current promotions
            from our builder and developer partners.
          </p>
        </header>

        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
          {LINKS.map(({ label, description, href, Icon }) => (
            <li key={label}>
              <Link
                href={href}
                className="flex items-center gap-4 px-1 py-5 group"
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-md border border-gray-300 flex items-center justify-center text-gray-700 group-hover:border-gray-400 group-hover:text-gray-900 transition-colors">
                  <Icon strokeWidth={1.75} size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-medium text-gray-900 leading-tight">
                    {label}
                  </span>
                  <span className="block text-sm text-gray-600 font-light leading-snug mt-1">
                    {description}
                  </span>
                </span>
                <ArrowRight
                  className="flex-shrink-0 text-gray-400 group-hover:text-gray-700 transition-colors"
                  strokeWidth={1.75}
                  size={18}
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
