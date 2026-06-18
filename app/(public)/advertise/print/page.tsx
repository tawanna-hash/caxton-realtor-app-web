// Print-only rate card landing page.
//
// Lists the five Brand[*] packages with their per-size pricing and
// features, then routes the buyer into the unified inquiry form with
// channel=print and the chosen package_id pre-selected. No self-serve
// checkout — print is quote-then-invoice via admin (PR C admin tooling).

import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import { PACKAGES, PRINT_DEADLINES } from '@/lib/media-kit';

export const metadata = {
  title: 'Print Advertising — RealtyLine & Newsline San Antonio',
  description:
    'Brand [1], [3], [6], [12], and [12 Plus] print + digital-edition advertising on RealtyLine Austin and Newsline San Antonio. Pick a package and we will follow up with a quote and invoice.',
};

function fmtUsd(n: number): string {
  return `$${n.toLocaleString()}`;
}

export default function AdvertisePrintPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
      <header className="mb-8 sm:mb-10">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
          Advertise · Print
        </p>
        <PageTitle>
          Print + digital editions, sold by the issue or by agreement.
        </PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Every Brand package runs your creative in both the printed magazine
          and the matching digital edition. Longer agreements unlock event
          coverage, social shares, e-Blasts, and front-page logo placement.
          Pick a package below and we&apos;ll send a quote with the exact
          invoice for your size and publication.
        </p>
      </header>

      {/* Packages grid */}
      <section className="mb-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PACKAGES.map((pkg) => (
            <article
              key={pkg.id}
              className={`relative flex flex-col border rounded p-5 ${
                pkg.premium
                  ? 'border-[#c2410c] bg-amber-50/30'
                  : pkg.popular
                  ? 'border-[#021D40]'
                  : 'border-gray-200'
              }`}
            >
              {pkg.popular && (
                <span className="absolute -top-3 left-5 px-2 py-0.5 rounded-full bg-[#021D40] text-white text-[10px] font-semibold uppercase tracking-wider">
                  Most popular
                </span>
              )}
              {pkg.premium && (
                <span className="absolute -top-3 left-5 px-2 py-0.5 rounded-full bg-[#c2410c] text-white text-[10px] font-semibold uppercase tracking-wider">
                  Premium
                </span>
              )}

              <div className="mb-3">
                <h3 className="text-xl font-semibold text-[#021D40]">
                  {pkg.name}
                </h3>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mt-0.5">
                  {pkg.term}
                </p>
                <p className="text-sm text-gray-700 mt-1">{pkg.tagline}</p>
              </div>

              {/* Size + price table */}
              <div className="mb-4">
                <p className="text-xs uppercase tracking-wider text-gray-500 font-medium mb-1.5">
                  Sizes &amp; rates (per month)
                </p>
                <ul className="text-sm text-gray-800 space-y-1">
                  {pkg.sizes.map((s) => (
                    <li key={s.size} className="flex items-baseline justify-between gap-3">
                      <span className="truncate">
                        <span className="font-medium">{s.size}</span>
                        <span className="text-xs text-gray-500 ml-1">
                          ({s.dim})
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {fmtUsd(s.price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Features */}
              <ul className="text-sm text-gray-700 space-y-1 mb-5 flex-1">
                {pkg.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden className="text-[#021D40] font-bold">·</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={`/advertise/inquire?channel=print&package=${encodeURIComponent(pkg.id)}`}
                className="inline-flex items-center justify-center px-4 py-2.5 bg-[#021D40] text-white text-sm font-medium rounded hover:bg-[#03285a] transition"
              >
                Request quote
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Print deadlines — calendar-aware buyers know when to commit */}
      {PRINT_DEADLINES.length > 0 && (
        <section className="mb-14">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
            2026 print deadlines
          </p>
          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">Issue</th>
                  <th className="px-4 py-2 font-medium">Materials deadline</th>
                  <th className="px-4 py-2 font-medium">Mails on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {PRINT_DEADLINES.map((d) => (
                  <tr key={d.month}>
                    <td className="px-4 py-2 font-medium">{d.month}</td>
                    <td className="px-4 py-2 text-gray-700">{d.deadline}</td>
                    <td className="px-4 py-2 text-gray-700">{d.mail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="border-t border-gray-200 pt-8">
        <p className="text-base text-gray-700 mb-4">
          Not sure which package fits? Tell us about your business and we&apos;ll
          recommend a size, frequency, and publication mix.
        </p>
        <Link
          href="/advertise/inquire?channel=print"
          className="inline-flex items-center justify-center px-5 py-2.5 border border-[#021D40] text-[#021D40] text-sm font-medium rounded hover:bg-[#021D40] hover:text-white transition"
        >
          Start a print inquiry
        </Link>
      </section>
        </div>
    </main>
  );
}
