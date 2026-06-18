// e-Blast (email) rate card landing page.
//
// Lists the e-Blast packages with their per-send pricing and features,
// then routes the buyer into the unified inquiry form with
// channel=email and the chosen package_id pre-selected. No self-serve
// checkout — email is quote-then-invoice via admin (see PR C quote
// builder, which also handles email).

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { EBLASTS } from '@/lib/media-kit';

export const metadata = {
  title: 'e-Blast Advertising — RealtyLine & Newsline San Antonio',
  description:
    'Exclusive e-Blasts to 64,000+ RealtyLine and Newsline San Antonio email subscribers. Pick a package and we will follow up with a quote and invoice.',
};

// Stable id for an e-Blast package — same convention as the public
// inquiry form and the admin quote builder. lowercase, no spaces.
function eblastId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '');
}

function fmtUsd(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default function AdvertiseEmailPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise · e-Blast
        </p>
        <PageTitle size="md">
          Drop straight into 64,000+ real-estate inboxes.
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Your message, your design, sent as a dedicated email to RealtyLine
          and Newsline San Antonio subscribers — agents, brokers, builders, and lenders
          across Central and South Texas. Pick a package below and we&apos;ll
          send a quote with the exact send date and invoice.
        </p>
      </header>

      {/* Audience stat ribbon */}
      <section className="mb-10 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-gray-200 px-4 py-4">
          <p className="text-2xl font-semibold text-[#021D40] tracking-tight">
            43K
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            RealtyLine email
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4">
          <p className="text-2xl font-semibold text-[#021D40] tracking-tight">
            21K
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Newsline San Antonio email
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4">
          <p className="text-2xl font-semibold text-[#021D40] tracking-tight">
            ~38%
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Avg open rate
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4">
          <p className="text-2xl font-semibold text-[#021D40] tracking-tight">
            Fri
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Weekly digest day
          </p>
        </div>
      </section>

      {/* Packages grid */}
      <section className="mb-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EBLASTS.map((eb, idx) => {
            const id = eblastId(eb.name);
            const isPopular = idx === EBLASTS.length - 1; // last (richest) package
            return (
              <article
                key={id}
                className={`relative flex flex-col border rounded p-6 ${
                  isPopular ? 'border-[#021D40]' : 'border-gray-200'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3 left-5 px-2 py-0.5 rounded-full bg-[#021D40] text-white text-[10px] font-semibold uppercase tracking-wider">
                    Most popular
                  </span>
                )}

                <h3 className="text-xl font-semibold text-[#021D40] mb-1">
                  {eb.name}
                </h3>
                <p className="text-3xl font-semibold text-gray-900 tabular-nums mb-1">
                  {fmtUsd(eb.price)}
                  <span className="text-sm font-normal text-gray-600 ml-1">
                    per send
                  </span>
                </p>

                <ul className="text-sm text-gray-700 space-y-1.5 my-4 flex-1">
                  {eb.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-[#021D40] font-bold">·</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/advertise/inquire?channel=email&package=${encodeURIComponent(id)}`}
                  className="inline-flex items-center justify-center px-4 py-2.5 bg-[#021D40] text-white text-sm font-medium rounded hover:bg-[#03285a] transition"
                >
                  Request quote
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {/* What you provide */}
      <section className="mb-12 border-t border-gray-200 pt-8">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          What you provide
        </p>
        <ul className="text-sm text-gray-800 space-y-2 max-w-2xl">
          <li>
            <span className="font-medium">Subject line</span> — 60 characters or
            fewer, no all-caps.
          </li>
          <li>
            <span className="font-medium">From name</span> — your business name
            as it should appear in the inbox.
          </li>
          <li>
            <span className="font-medium">HTML or images</span> — we accept a
            full HTML build or a single hero image with a destination URL.
            Banner specs match the print + digital edition (1200 × 600 px is a
            safe default).
          </li>
          <li>
            <span className="font-medium">Preferred send date</span> — we&apos;ll
            confirm against the editorial calendar.
          </li>
        </ul>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-200 pt-8">
        <p className="text-base text-gray-700 mb-4">
          Not sure which package fits, or want to talk about a custom multi-send
          campaign? Tell us about your goal and we&apos;ll send a recommendation.
        </p>
        <Link
          href="/advertise/inquire?channel=email"
          className="inline-flex items-center justify-center px-5 py-2.5 border border-[#021D40] text-[#021D40] text-sm font-medium rounded hover:bg-[#021D40] hover:text-white transition"
        >
          Start an e-Blast inquiry
        </Link>
      </section>
        </div>
    </main>
  );
}
