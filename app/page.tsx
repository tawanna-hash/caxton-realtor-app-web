import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { isNativeAppUserAgent } from '@/lib/native-user-agent';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME } from '@/lib/auth/cookie-names';
import JsonLd from '@/components/seo/JsonLd';
import {
  SITE_TAGLINE,
  siteStructuredData,
  webPage,
} from '@/lib/structured-data';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'Realty News Now | Texas Real Estate News, Events & Magazines' },
  description: SITE_TAGLINE,
  alternates: { canonical: 'https://realtynewsnow.app/' },
};

// Public, server-rendered landing page for `/`.
//
// Signed-in users (session cookie present) and the installed native app
// (iOS/Android Capacitor webview) keep the old behavior and go straight to
// /dashboard. Everyone else — including search
// engine and AI crawlers, which do not run client JavaScript — gets a
// complete description of what Realty News Now is, which markets it serves,
// and links to the main sections. Every visitor sees the same HTML.
const SECTIONS = [
  { href: '/magazine', title: 'Magazine issues', body: 'Digital issues of RealtyLine (Austin) and Newsline San Antonio.' },
  { href: '/calendar', title: 'Event calendar', body: 'Upcoming real estate events, classes, and networking in Austin and San Antonio.' },
  { href: '/builders', title: 'Builders & developers', body: 'New home communities, move-in ready homes, and builder promotions.' },
  { href: '/partners', title: 'Partners', body: 'The local businesses that support RealtyLine and Newsline San Antonio.' },
  { href: '/giveaways', title: 'Giveaways', body: 'Prizes and offers for subscribers.' },
  { href: '/advertise', title: 'Advertise with us', body: 'Audience reach and print, digital, email, and mobile advertising options.' },
];

export default async function HomePage() {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE_NAME)?.value) redirect('/dashboard');
  const h = await headers();
  if (isNativeAppUserAgent(h.get('user-agent'))) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-white">
      <JsonLd
        data={[
          siteStructuredData(),
          webPage({
            path: '/',
            name: 'Realty News Now',
            description: SITE_TAGLINE,
          }),
        ]}
      />
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Realty News Now
        </p>
        <h1 className="text-3xl sm:text-4xl text-gray-900 mb-4">
          Texas real estate news, events, and magazines
        </h1>
        <p className="text-base md:text-lg text-gray-700 font-light leading-relaxed mb-4">
          Realty News Now is a free Texas real estate news app and publishing
          platform from Caxton Publications, Inc. It brings together{' '}
          <strong className="font-semibold">RealtyLine</strong>, the Austin and
          Central Texas magazine founded in 1995, and{' '}
          <strong className="font-semibold">Newsline San Antonio</strong>, the
          San Antonio and South Texas magazine founded in 1982 and relaunched
          in 2025, with daily news, an event calendar, digital magazine issues,
          builder inventory, and giveaways for REALTORS®, brokers, builders,
          lenders, and title professionals.
        </p>
        <p className="text-base text-gray-700 font-light leading-relaxed mb-8">
          Austin and San Antonio are live. Houston and Dallas/Fort Worth
          editions are coming soon.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition"
          >
            Open the app / Sign in
          </Link>
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 border border-gray-300 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-50 transition"
          >
            Get the free weekly email
          </Link>
        </div>

        <h2 className="text-xl text-gray-900 mb-4">What you will find</h2>
        <ul className="divide-y divide-gray-200 border-t border-b border-gray-200 mb-10">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="block py-4 hover:bg-gray-50">
                <span className="font-semibold text-gray-900">{s.title}</span>
                <span className="block text-gray-700 font-light">{s.body}</span>
              </Link>
            </li>
          ))}
        </ul>

        <p className="text-sm text-gray-500">
          <Link href="/about" className="underline underline-offset-2">About us</Link>
          {' · '}
          <Link href="/faq" className="underline underline-offset-2">FAQ</Link>
          {' · '}
          <a href="mailto:hello@myrealtyline.com" className="underline underline-offset-2">hello@myrealtyline.com</a>
        </p>
      </div>
    </main>
  );
}
