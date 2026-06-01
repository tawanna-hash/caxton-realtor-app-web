'use client';

// app/admin/media-kit/MediaKitClient.tsx
//
// 2026 Media Kit reference page. Pulls all data from lib/media-kit.ts so
// rates here always match what the Sign Wizard / agreement PDF use.

import {
  PACKAGES,
  EBLASTS,
  PRINT_DEADLINES,
  RATE_MATRIX,
  FREQ_LABELS,
  FREQ_TERMS,
  BRAND_12_PLUS_RATE,
  AUDIENCE_STATS,
  POLICY_NOTES,
  type Package,
  type EBlast,
} from '@/lib/media-kit';

const ACCENT = '#D22531';
const PREMIUM = '#3D0740';

const fmt = (n: number) => '$' + n.toLocaleString();

// ── Section heading (red bar + Georgia serif title) ───────────────────────

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1 h-7 rounded-sm flex-shrink-0" style={{ background: ACCENT }} />
      <h2 className="text-xl text-gray-900 m-0" style={{ fontFamily: 'Georgia, serif' }}>
        {children}
      </h2>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
      {children}
    </div>
  );
}

// ── Package card ───────────────────────────────────────────────────────────

function PackageCard({ pkg }: { pkg: Package }) {
  const isPopular = !!pkg.popular;
  const isPremium = !!pkg.premium;
  const topBorder = isPopular ? `border-t-4` : '';
  const topBorderStyle = isPopular ? { borderTopColor: ACCENT } : undefined;

  return (
    <div
      className={`relative bg-white border border-gray-200 rounded-lg flex flex-col shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all ${topBorder}`}
      style={topBorderStyle}
    >
      {(isPopular || isPremium) && (
        <span
          className="absolute -top-3 right-4 text-white text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full shadow-sm"
          style={{ background: isPopular ? ACCENT : PREMIUM }}
        >
          ★ {isPopular ? 'Most Popular' : 'Premium'}
        </span>
      )}

      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="text-[17px] font-bold text-gray-900">{pkg.name}</div>
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0">
            {pkg.term}
          </span>
        </div>
        <div className="text-xs text-gray-500 mb-4">{pkg.tagline}</div>

        <div className="border-t border-gray-200 mb-4" />

        <div className="mb-4 flex-1">
          <Eyebrow>Included Features</Eyebrow>
          <ul className="list-none m-0 p-0 space-y-1">
            {pkg.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12.5px] text-gray-800">
                <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-gray-200 mb-4" />

        <div>
          <Eyebrow>Ad Sizes &amp; Monthly Rates</Eyebrow>
          <div className="rounded border border-gray-200 overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th
                    className="px-2.5 py-2 text-left text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Size
                  </th>
                  <th
                    className="px-2.5 py-2 text-left text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2 hidden md:table-cell"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Dimensions
                  </th>
                  <th
                    className="px-2.5 py-2 text-right text-[11.5px] font-semibold text-gray-600 bg-gray-50 border-b-2"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    Rate/Month
                  </th>
                </tr>
              </thead>
              <tbody>
                {pkg.sizes.map((s, i) => (
                  <tr key={s.size} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2.5 py-2 font-medium text-xs text-gray-900">{s.size}</td>
                    <td className="px-2.5 py-2 text-gray-500 text-[11px] hidden md:table-cell">{s.dim}</td>
                    <td
                      className="px-2.5 py-2 text-right font-bold text-[13px]"
                      style={{ color: ACCENT }}
                    >
                      {fmt(s.price)}/mo
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── e-Blast card ──────────────────────────────────────────────────────────

function EBlastCard({ pkg }: { pkg: EBlast }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="text-[15px] font-bold text-gray-900">{pkg.name}</div>
        <div className="bg-gray-50 px-3 py-1.5 rounded text-right">
          <div className="text-2xl font-extrabold" style={{ color: ACCENT }}>
            {fmt(pkg.price)}
          </div>
          <div className="text-[11px] text-gray-500">per blast</div>
        </div>
      </div>
      <div className="border-t border-gray-200 mb-3" />
      <ul className="list-none m-0 p-0 space-y-1">
        {pkg.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-gray-800">
            <span className="text-emerald-600 flex-shrink-0 mt-0.5">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-gray-500 italic">
        *Same Event Details, Same Advert Materials. **Photo Coverage for publishing purposes only.
      </p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function MediaKitClient() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-12">
      {/* Page header */}
      <header>
        <Eyebrow>2026 Media Kit</Eyebrow>
        <h1 className="text-3xl text-gray-900 mb-2" style={{ fontFamily: 'Georgia, serif' }}>
          RealtyLine Austin · Ad Packages &amp; Rates
        </h1>
        <p className="text-sm text-gray-600 max-w-3xl">
          Reference sheet for sales — packages, ad rates, e-blasts, print deadlines, and
          contract policies pulled from the master 2026 Media Kit. Pricing here always
          matches the Sign Wizard and the generated agreement PDF.
        </p>

        {/* Audience stats */}
        <div className="flex flex-wrap gap-2 mt-4">
          {AUDIENCE_STATS.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full"
            >
              <span className="text-xs text-gray-500">{s.label}:</span>
              <span className="text-sm font-bold" style={{ color: ACCENT }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </header>

      {/* Packages */}
      <section>
        <SectionHead>Print &amp; Digital Ad Rate Packages</SectionHead>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PACKAGES.map((p) => (
            <PackageCard key={p.id} pkg={p} />
          ))}
        </div>
      </section>

      {/* Rate matrix */}
      <section>
        <SectionHead>Ad Rates by Size &amp; Frequency</SectionHead>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th
                  className="px-3 py-2.5 text-left text-xs font-bold text-gray-600 bg-gray-50 border-b-2 border-r border-gray-200"
                  style={{ borderBottomColor: ACCENT }}
                >
                  Ad Size
                </th>
                {FREQ_LABELS.map((f, i) => (
                  <th
                    key={f}
                    className="px-3 py-2.5 text-center text-xs font-bold text-gray-600 bg-gray-50 border-b-2 border-r border-gray-200"
                    style={{ borderBottomColor: ACCENT }}
                  >
                    {f}
                    <div className="text-[11px] font-medium text-gray-400 mt-0.5">
                      {FREQ_TERMS[i]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(RATE_MATRIX).map((size, ri) => {
                const prices = RATE_MATRIX[size]!;
                return (
                  <tr key={size} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2.5 font-semibold text-[13px] text-gray-900">{size}</td>
                    {prices.map((p, ci) => {
                      const isBest = ci === 3;
                      return (
                        <td
                          key={ci}
                          className="px-3 py-2.5 text-center text-[13px] font-bold"
                          style={{ color: isBest ? ACCENT : '#111827' }}
                        >
                          {fmt(p)}/mo
                          {isBest && (
                            <div
                              className="text-[11px] font-semibold opacity-80"
                              style={{ color: ACCENT }}
                            >
                              Best Rate
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {/* Brand[12 Plus] premium tier */}
              <tr style={{ background: 'rgba(61, 7, 64, 0.06)' }}>
                <td className="px-3 py-2.5 font-semibold text-[13px] text-gray-900">
                  Full Page{' '}
                  <span
                    className="text-[11.5px] font-bold px-1.5 py-0.5 rounded-full text-white ml-1"
                    style={{ background: PREMIUM }}
                  >
                    Brand[12 Plus]
                  </span>
                </td>
                <td
                  colSpan={3}
                  className="px-3 py-2.5 text-center text-xs text-gray-400 italic"
                >
                  Not available
                </td>
                <td
                  className="px-3 py-2.5 text-center text-[13px] font-bold"
                  style={{ color: PREMIUM }}
                >
                  {fmt(BRAND_12_PLUS_RATE)}/mo
                  <div className="text-[11.5px] font-semibold" style={{ color: PREMIUM }}>
                    Full Page Only
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* e-Blast packages */}
      <section>
        <SectionHead>e-Blast Packages</SectionHead>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {EBLASTS.map((p) => (
            <EBlastCard key={p.name} pkg={p} />
          ))}
        </div>
      </section>

      {/* Print deadlines */}
      <section>
        <SectionHead>2026 Print Deadlines</SectionHead>
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm divide-y divide-gray-200">
          {PRINT_DEADLINES.map((d, i) => (
            <div
              key={d.month}
              className={`flex items-center justify-between px-4 py-3 ${
                Math.floor(i / 2) % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}
            >
              <div>
                <div className="text-[13.5px] font-bold text-gray-900">{d.month}</div>
                <div className="text-[11.5px] text-gray-500">Mail: {d.mail}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-500">Deadline</div>
                <div className="text-[13px] font-semibold" style={{ color: ACCENT }}>
                  {d.deadline}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Policy notes */}
      <section>
        <SectionHead>Policies &amp; Notes</SectionHead>
        <div className="space-y-3">
          {POLICY_NOTES.map((n) => (
            <div
              key={n.title}
              className="bg-white border-l-4 border border-gray-200 rounded-r-lg p-4 shadow-sm"
              style={{ borderLeftColor: n.color }}
            >
              <div className="text-sm font-bold text-gray-900 mb-1" style={{ color: n.color }}>
                {n.title}
              </div>
              <div className="text-[13px] text-gray-700 leading-relaxed">{n.body}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
