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
        <div className="border border-gray-200 px-4 py-4 rounded-md">
          <p className="text-2xl font-semibold text-brand-700 tracking-tight">
            44K+
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            RealtyLine email
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4 rounded-md">
          <p className="text-2xl font-semibold text-brand-700 tracking-tight">
            20K+
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Newsline San Antonio email
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4 rounded-md">
          <p className="text-2xl font-semibold text-brand-700 tracking-tight">
            ~38%
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Avg open rate
          </p>
        </div>
        <div className="border border-gray-200 px-4 py-4 rounded-md">
          <p className="text-2xl font-semibold text-brand-700 tracking-tight">
            Fri
          </p>
          <p className="text-xs uppercase tracking-wider text-gray-500 mt-1 font-medium">
            Weekly digest day
          </p>
        </div>
      </section>

      {/* Packages grid — PDF-match: grouped by pub, bundle strip */}
      <section className="mb-14 space-y-6">
        {(
          [
            { pub: 'realtyline' as const, label: 'RealtyLine Austin',    subs: '44K+ subscribers' },
            { pub: 'newsline' as const,   label: 'Newsline San Antonio', subs: '20K+ subscribers' },
          ]
        ).map((row) => {
          const available = EBLASTS.filter((b) => !b.availablePubs || b.availablePubs.includes(row.pub));
          return (
            <div key={row.pub} className="rounded-md bg-gray-50 ring-1 ring-gray-200 p-5">
              <div className="text-base font-semibold text-gray-900 mb-3">{row.label}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {available.map((eb) => {
                  const id = eblastId(eb.name);
                  const price = eb.priceByPub?.[row.pub] ?? eb.price;
                  const features = eb.featuresByPub?.[row.pub] ?? eb.features;
                  return (
                    <article key={id} className="flex flex-col rounded-md border border-gray-200 bg-white p-5">
                      <p className="text-sm text-gray-700">{eb.name}</p>
                      <p className="text-2xl font-bold text-brand-700 tabular-nums mt-1">
                        {fmtUsd(price)}
                        <span className="text-sm font-semibold ml-0.5">/send</span>
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">Based on {row.subs}</p>
                      <ul className="text-sm text-gray-900 list-disc pl-5 mt-3 space-y-1 flex-1">
                        {features.map((f) => (<li key={f}>{f}</li>))}
                      </ul>
                      <Link
                        href={`/advertise/inquire?channel=email&package=${encodeURIComponent(id)}${row.pub === 'newsline' ? '&pub=newsline' : ''}`}
                        className="mt-4 inline-flex items-center justify-center px-4 py-2 bg-brand-700 text-white text-sm font-medium rounded-md hover:bg-brand-800 transition"
                      >
                        Request quote
                      </Link>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Bundle strip — Austin + Newsline SA at 10% off */}
        {(() => {
          const pkg1 = EBLASTS.find((b) => b.name === 'e-Blast Package No. 1');
          const pkg2 = EBLASTS.find((b) => b.name === 'e-Blast Package No. 2');
          if (!pkg1 || !pkg2) return null;
          return (
            <div className="rounded-md bg-gray-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm font-semibold">Both Markets Bundle — 10% Off</div>
              <div className="text-sm flex flex-wrap gap-6">
                <span>Package No. 1: <span className="text-brand-300 font-semibold">{fmtUsd(pkg1.priceByPub?.both ?? 0)}/send</span></span>
                <span>Package No. 2: <span className="text-brand-300 font-semibold">{fmtUsd(pkg2.priceByPub?.both ?? 0)}/send</span></span>
                <Link
                  href="/advertise/inquire?channel=email"
                  className="underline hover:no-underline"
                >
                  Request bundle quote →
                </Link>
              </div>
            </div>
          );
        })()}

        <p className="text-xs text-gray-600">
          * Subject to availability and advance scheduling. ** Follow-up e-Blast(s) sent within same billing cycle.
        </p>
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
          className="inline-flex items-center justify-center px-5 py-2.5 border border-brand-700 text-brand-700 text-sm font-medium rounded-md hover:bg-brand-700 hover:text-white transition"
        >
          Start an e-Blast inquiry
        </Link>
      </section>
        </div>
    </main>
  );
}
