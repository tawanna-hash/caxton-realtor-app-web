// app/(public)/advertise-to-realtors/[market]/page.tsx
//
// Server-rendered, answer-style pages for the question "how/where do I
// advertise to REALTORS® in Austin / San Antonio?". Facts come from the
// published media kit and About page; rates are intentionally not shown here
// (they live on /advertise).

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import JsonLd from '@/components/seo/JsonLd';
import { SITE_URL, breadcrumbs, webPage } from '@/lib/structured-data';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ market: 'austin' }, { market: 'san-antonio' }];
}

type Market = {
  slug: 'austin' | 'san-antonio';
  city: string;
  region: string;
  magazine: string;
  founded: string;
  history: string;
  stats: Array<[string, string]>;
  associations: string[];
  others: string;
};

const MARKETS: Record<string, Market> = {
  austin: {
    slug: 'austin',
    city: 'Austin',
    region: 'Central Texas',
    magazine: 'RealtyLine Austin',
    founded: '1995',
    history:
      'RealtyLine has covered Austin real estate professionals since 1995, under the tagline “Putting A Face on Real Estate.”',
    stats: [
      ['16.5K+', 'print copies'],
      ['44K+', 'email subscribers'],
      ['6.64M+', 'annual email sends'],
      ['3.1%', 'verified open rate'],
    ],
    associations: [
      'Austin Board of REALTORS® (ABoR)',
      'Home Builders Association of Greater Austin',
      'Women’s Council of REALTORS® Austin Chapter (RealtyLine is an honorary member)',
      'Texas REALTORS® and the National Association of REALTORS®',
    ],
    others:
      'Austin also has general-interest and business publications and association channels such as the Austin Board of REALTORS®. RealtyLine is different in that its entire audience and editorial focus is the real estate industry.',
  },
  'san-antonio': {
    slug: 'san-antonio',
    city: 'San Antonio',
    region: 'South Texas',
    magazine: 'Newsline San Antonio',
    founded: '1982',
    history:
      'Newsline San Antonio was founded in 1982 and relaunched in 2025 as a monthly magazine for the San Antonio real estate community.',
    stats: [
      ['20,000', 'email subscribers'],
      ['Monthly', 'print and digital issues'],
      ['Print, digital, email, mobile', 'advertising options'],
    ],
    associations: [
      'San Antonio Board of REALTORS® (SABOR)',
      'Greater San Antonio Builders Association (GSABA)',
      'Women’s Council of REALTORS® San Antonio Chapter',
      'NAHREP San Antonio Chapter',
      'Texas REALTORS® and the National Association of REALTORS®',
    ],
    others:
      'San Antonio also has general-interest newspapers and association channels such as SABOR. Newsline San Antonio is different in that its entire audience and editorial focus is the real estate industry.',
  },
};

function faqFor(m: Market) {
  return [
    {
      q: `What is the best way to advertise to realtors in ${m.city}?`,
      a: `${m.magazine} is a monthly magazine and email publication written for ${m.city}-area real estate professionals, published by Caxton Publications, Inc. Advertisers can reach REALTORS®, brokers, builders, lenders, and title professionals through print and digital magazine ads, weekly email placements, e-blasts, mobile app placements, event coverage, and an online event calendar.`,
    },
    {
      q: `Which ${m.city} publication is focused on real estate professionals?`,
      a: `${m.magazine} is dedicated to the real estate industry in ${m.city} and ${m.region}. ${m.history} It is also available in the free Realty News Now app.`,
    },
    {
      q: `How many people does ${m.magazine} reach?`,
      a:
        m.slug === 'austin'
          ? 'According to the 2026 media kit, RealtyLine Austin has 16.5K+ print copies, 44K+ email subscribers, 6.64M+ annual email sends, 204K+ email opens and a 3.1% verified open rate. Apple Mail Privacy Protection and bot activity are filtered from open-rate reporting.'
          : 'According to the 2026 media kit, Newsline San Antonio has 20,000 email subscribers, with print, digital, email, and mobile advertising options.',
    },
    {
      q: `What advertising options are available in ${m.city}?`,
      a: 'Print ads in the monthly magazine (full, half, and quarter page), digital edition ads, weekly email placements, solo e-blasts, builder and developer inventory in the weekly e-blast, press release and featured advertiser articles, social media shares, event coverage, and unlimited online calendar listings, depending on the brand package.',
    },
    {
      q: `How do I get ${m.magazine} advertising rates?`,
      a: `Current rates, print specifications, and deadlines are in the advertising media kit at ${SITE_URL}/advertise. You can also send an inquiry at ${SITE_URL}/advertise/inquire or email hello@myrealtyline.com.`,
    },
  ];
}

type PageProps = { params: Promise<{ market: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const m = MARKETS[(await params).market];
  if (!m) return {};
  const path = `/advertise-to-realtors/${m.slug}`;
  const title = `Advertise to Realtors in ${m.city} — ${m.magazine}`;
  const description = `How to reach ${m.city} REALTORS®, brokers, builders, and lenders with ${m.magazine}: audience numbers, print, digital, email, and mobile options.`;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { type: 'website', title, description, url: `${SITE_URL}${path}` },
  };
}

export default async function AdvertiseToRealtorsPage({ params }: PageProps) {
  const m = MARKETS[(await params).market];
  if (!m) notFound();
  const path = `/advertise-to-realtors/${m.slug}`;
  const faq = faqFor(m);

  return (
    <main className="min-h-screen bg-white">
      <JsonLd
        data={[
          {
            ...webPage({
              path,
              name: `Advertise to Realtors in ${m.city} — ${m.magazine}`,
              description: `How to reach ${m.city} real estate professionals with ${m.magazine}.`,
              type: 'FAQPage',
            }),
            mainEntity: faq.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          },
          breadcrumbs([
            { name: 'Home', path: '/' },
            { name: 'Advertise', path: '/advertise' },
            { name: `${m.city} realtors`, path },
          ]),
        ]}
      />
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          {m.magazine}
        </p>
        <h1 className="text-3xl sm:text-4xl text-gray-900 mb-4">
          How to advertise to realtors in {m.city}
        </h1>
        <p className="text-base md:text-lg text-gray-700 font-light leading-relaxed mb-4">
          {m.magazine} is a monthly real estate magazine and email publication
          for {m.city} and {m.region} REALTORS®, brokers, builders, lenders,
          and title professionals. {m.history} It is published by Caxton
          Publications, Inc. and is part of the free Realty News Now app.
        </p>
        <p className="text-base text-gray-700 font-light leading-relaxed mb-8">
          {m.others}
        </p>

        <h2 className="text-xl text-gray-900 mb-3">Audience</h2>
        <ul className="grid grid-cols-2 gap-3 mb-3">
          {m.stats.map(([n, label]) => (
            <li key={label} className="border border-gray-200 rounded-md p-4">
              <span className="block text-2xl font-semibold text-gray-900">{n}</span>
              <span className="text-sm text-gray-600">{label}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-gray-500 mb-8">
          Source: 2026 media kit. Open rates are verified human engagement, with
          Apple Mail Privacy Protection and bot activity filtered out.
        </p>

        <h2 className="text-xl text-gray-900 mb-3">Ways to reach {m.city} agents</h2>
        <ul className="list-disc pl-5 text-gray-700 font-light leading-relaxed mb-8 space-y-1">
          <li>Print ads in the monthly magazine (full, half, and quarter page)</li>
          <li>Ads in the digital edition, readable in the app and on the web</li>
          <li>Weekly email placements and solo e-blasts</li>
          <li>Builder and developer inventory in the weekly e-blast</li>
          <li>Featured advertiser articles, press releases, and social shares</li>
          <li>Event coverage and unlimited online calendar listings</li>
          <li>Mobile app placements in the Realty News Now app</li>
        </ul>

        <h2 className="text-xl text-gray-900 mb-3">Industry relationships</h2>
        <p className="text-gray-700 font-light mb-2">
          Caxton Publications is a member of and active partner with:
        </p>
        <ul className="list-disc pl-5 text-gray-700 font-light leading-relaxed mb-8 space-y-1">
          {m.associations.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>

        <h2 className="text-xl text-gray-900 mb-4">Frequently asked questions</h2>
        <div className="divide-y divide-gray-200 border-t border-b border-gray-200 mb-10">
          {faq.map((f) => (
            <div key={f.q} className="py-4">
              <h3 className="font-semibold text-gray-900 mb-1">{f.q}</h3>
              <p className="text-gray-700 font-light leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/advertise"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition"
          >
            View the media kit and rates
          </Link>
          <Link
            href="/advertise/inquire"
            className="inline-flex items-center justify-center min-h-[44px] px-6 py-3 border border-gray-300 text-gray-900 text-sm font-medium rounded-md hover:bg-gray-50 transition"
          >
            Send an inquiry
          </Link>
        </div>
      </div>
    </main>
  );
}
