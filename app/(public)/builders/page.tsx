// app/(public)/builders/page.tsx
//
// Builder / Developer Advertisers hub.
// Reached from the new BottomNav "Builders" tab (S18 Stage B).
// Two-column layout: RealtyLine Austin on the left, Newsline San Antonio
// on the right. Each column links to the three sub-destinations with
// publication scoping via ?pub= query param (S18 c-proper, C.1 + C.2).
//
// Server component — pure static markup. No client state needed; the
// destination pages handle pub state via URL params.

import Link from 'next/link';
import { Home, Building2, Tag, ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Builder & Developer Advertisers \u2014 Realty News Now',
  description:
    'New home communities, move-in ready homes, and promotions from Austin and San Antonio builders and developers.',
};

const REALTYLINE_COLOR = '#021D40';
const NEWSLINE_COLOR = '#3D0740';

type Pub = 'realtyline' | 'newsline';

type LinkItem = {
  label: string;
  description: string;
  href: (pub: Pub) => string;
  Icon: typeof Home;
};

const LINKS: LinkItem[] = [
  {
    label: 'New Home Communities',
    description: 'Master-planned developments and active community listings.',
    href: (pub) => `/communities?pub=${pub}`,
    Icon: Building2,
  },
  {
    label: 'Move-in Ready Homes',
    description: 'Specific homes available now from builder partners.',
    href: (pub) => `/inventory?kind=listing&pub=${pub}`,
    Icon: Home,
  },
  {
    label: 'Promotions',
    description: 'Current incentives, rate buy-downs, and limited-time offers.',
    href: (pub) => `/inventory?kind=promotion&pub=${pub}`,
    Icon: Tag,
  },
];

function Column({
  pub,
  title,
  subtitle,
  color,
}: {
  pub: Pub;
  title: string;
  subtitle: string;
  color: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className="px-5 py-6 text-white rounded-t-lg"
        style={{ backgroundColor: color }}
      >
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-white/60">
          {subtitle}
        </p>
        <h2 className="text-xl sm:text-2xl font-semibold mt-1">{title}</h2>
      </div>
      <ul className="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden divide-y divide-gray-200 bg-white">
        {LINKS.map(({ label, description, href, Icon }) => (
          <li key={label}>
            <Link
              href={href(pub)}
              className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition group"
            >
              <span
                className="flex-shrink-0 w-10 h-10 rounded-md flex items-center justify-center"
                style={{ backgroundColor: color + '12', color: color }}
              >
                <Icon strokeWidth={1.75} size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold text-gray-900 leading-tight">
                  {label}
                </span>
                <span className="block text-sm text-gray-500 font-light leading-snug mt-0.5">
                  {description}
                </span>
              </span>
              <ArrowRight
                className="flex-shrink-0 text-gray-300 group-hover:text-gray-500 transition"
                strokeWidth={1.75}
                size={18}
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BuildersHubPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-14">
        <header className="mb-8 sm:mb-10">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 font-medium">
            Hub
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-gray-900 mt-1">
            Builder &amp; Developer Advertisers
          </h1>
          <p className="text-base text-gray-600 mt-3 max-w-2xl">
            Choose a publication to explore communities, move-in ready homes,
            and current promotions from our builder and developer partners.
          </p>
        </header>

        <div className="flex flex-col lg:flex-row gap-6">
          <Column
            pub="realtyline"
            title="RealtyLine"
            subtitle="Austin"
            color={REALTYLINE_COLOR}
          />
          <Column
            pub="newsline"
            title="Newsline"
            subtitle="San Antonio"
            color={NEWSLINE_COLOR}
          />
        </div>
      </div>
    </main>
  );
}
