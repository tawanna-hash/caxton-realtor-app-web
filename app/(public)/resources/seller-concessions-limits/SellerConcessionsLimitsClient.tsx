'use client';

// app/(public)/resources/seller-concessions-limits/SellerConcessionsLimitsClient.tsx
//
// Single-input reference: enter the listing price, see the maximum seller
// contribution for every loan program × down-payment band on one card.
// Inspired by Tawanna's reference design (Jun 2026) which puts the entire
// agency matrix in front of agents at a listing appointment without making
// them pick a program first.
//
// Layout: a hero "card" (table) on the left with all scenarios, and a
// (the previous right-rail share buttons + suggested caption card were
// removed - sharing now lives on the global ResourceFloater pill.)
// Numbers come from lib/realtor-calc-math.ts (CONCESSION_DISPLAY) so the
// math file remains the single source of truth.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  CONCESSION_DISPLAY,
  type ConcessionDisplayRow,
} from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

/**
 * Round a dollar amount to the nearest $500 so the card reads as a clean
 * negotiation number ("$16,500" instead of "$16,484.93"). Above $50k we
 * round to the nearest $1k; above $250k to the nearest $5k.
 */
function roundForDisplay(n: number): number {
  if (n < 50_000) return Math.round(n / 500) * 500;
  if (n < 250_000) return Math.round(n / 1_000) * 1_000;
  return Math.round(n / 5_000) * 5_000;
}

export default function SellerConcessionsLimitsClient() {
  const [salePrice, setSalePrice] = useState(550_000);

  const buildReport = (): CalcReport => ({
    title: "Seller's Concession Limits",
    subtitle: `Listing price ${fmtUSD(salePrice)}`,
    heroLabel: 'Listing price',
    heroValue: fmtUSD(salePrice),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Listing price', value: fmtUSD(salePrice) },
    ],
    sections: CONCESSION_DISPLAY.flatMap((group) =>
      group.scenarios.map((sc) => ({
        heading: `${group.programLabel} — ${sc.occupancyLabel}`,
        rows: sc.rows.map((row) => ({
          label: `${row.downBand} · ${sc.coverage}`,
          value:
            row.kind === 'unlimited'
              ? 'Unlimited'
              : `${fmtUSD(roundForDisplay(((row.capPct ?? 0) * salePrice) / 100))} (${row.capPct}%)`,
          emphasis: true,
        })),
      })),
    ),
    disclaimer:
      'Agency caps shown. Lender / investor overlays can be stricter. VA defines "concessions" more narrowly than the other agencies — the seller may also pay normal closing costs separately. Always confirm allowable structure with the lender before contract.',
    filename: `concession-limits-${salePrice}`,
  });


  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Reference</p>
        <PageTitle size="md">Seller&rsquo;s Concession Limits</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          The maximum a seller can contribute toward a buyer&rsquo;s costs,
          by loan program and down-payment band. Enter your listing price
          and the dollar caps update across every program at once &mdash;
          built for negotiation prep at the listing appointment.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* ── Reference card ─────────────────────────────────────── */}
        <div>
          <article className="rounded-md border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Card header: eyebrow + title + listing-price input */}
            <header className="px-6 md:px-8 pt-6 pb-5 border-b border-gray-100 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-700 mb-2">
                  Seller Financing Guide
                </p>
                <h2
                  className="text-2xl md:text-3xl text-gray-900 leading-tight"
                >
                  Seller concession <span className="text-brand-700">limits</span>
                </h2>
                <p className="text-sm text-gray-600 mt-2 max-w-md leading-relaxed">
                  The maximum a seller can contribute toward a buyer&rsquo;s
                  costs, by loan program and down payment.
                </p>
              </div>

              <ListingPriceInput value={salePrice} onChange={setSalePrice} />
            </header>

            {/* Column labels */}
            <div className="px-6 md:px-8 pt-5 grid grid-cols-12 gap-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
              <div className="col-span-5">Loan &amp; coverage</div>
              <div className="col-span-4">Down payment</div>
              <div className="col-span-3 text-right">Max seller contribution</div>
            </div>

            {/* Program groups */}
            <div className="px-6 md:px-8 py-4 divide-y divide-gray-100">
              {CONCESSION_DISPLAY.map((group) =>
                group.scenarios.map((sc, sIdx) => (
                  <ScenarioBlock
                    key={`${group.program}-${sIdx}`}
                    accent={group.accent}
                    programLabel={group.programLabel}
                    occupancyLabel={sc.occupancyLabel}
                    coverage={sc.coverage}
                    rows={sc.rows}
                    salePrice={salePrice}
                    footnote={sc.footnote}
                  />
                )),
              )}
            </div>

            <footer className="px-6 md:px-8 py-4 border-t border-gray-100 text-[11px] text-gray-500 italic leading-relaxed">
              *USDA and all figures are estimates only. Please obtain final
              numbers prior to closing. Lender / investor overlays may be
              stricter than the agency caps shown.
            </footer>
          </article>
        </div>

      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed print:hidden">
        Sources:{' '}
        <a
          href="https://selling-guide.fanniemae.com/sel/b3-4.1-02/interested-party-contributions-ipcs"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          Fannie Mae B3-4.1-02
        </a>
        {' · '}
        <a
          href="https://guide.freddiemac.com/app/guide/section/5501.5"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          Freddie Mac §5501.5
        </a>
        {' · '}
        <a
          href="https://www.hud.gov/sites/dfiles/OCHCO/documents/40001HSGH.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          HUD 4000.1
        </a>
        {' · '}
        <a
          href="https://benefits.va.gov/WARMS/M26_7.asp"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          VA Lenders Handbook
        </a>
        {' · '}
        <a
          href="https://www.rd.usda.gov/sites/default/files/3555-1chapter06.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
        >
          USDA HB-1-3555 Ch. 6
        </a>
      </p>

      <ResourceFloater
        shareTitle="Seller's Concession Limits — RealtyLine Austin"
        shareText="Agency caps on seller concessions: Conventional, FHA, VA, USDA."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ListingPriceInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  // Show a US-formatted view while editing the underlying number. The
  // <input> is text so we can render the $ + commas while typing.
  const display = useMemo(() => fmtUSD(value), [value]);

  return (
    <label className="inline-flex flex-col rounded-md border border-gray-200 bg-white px-4 py-3 min-w-[180px]">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 text-right">
        Listing price
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          const n = digits === '' ? 0 : Number(digits);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="bg-transparent text-right text-xl text-gray-900 font-semibold focus:outline-none mt-0.5"
        aria-label="Listing price"
      />
    </label>
  );
}

function ScenarioBlock({
  accent,
  programLabel,
  occupancyLabel,
  coverage,
  rows,
  salePrice,
  footnote,
}: {
  accent: string;
  programLabel: string;
  occupancyLabel: string;
  coverage: string;
  rows: ConcessionDisplayRow[];
  salePrice: number;
  footnote?: string;
}) {
  return (
    <div className="py-4 first:pt-2 last:pb-2">
      <div className="grid grid-cols-12 gap-4">
        {/* Loan & coverage */}
        <div className="col-span-12 sm:col-span-5">
          <div className="flex items-start gap-2">
            <span
              className="mt-2 inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: accent }}
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-gray-900 leading-snug">
                {programLabel}
              </p>
              <p className="text-sm text-gray-600 leading-snug mt-0.5">
                {occupancyLabel}
              </p>
              <p className="text-[11px] text-gray-500 leading-relaxed mt-1">
                {coverage}
              </p>
            </div>
          </div>
        </div>

        {/* Down payment + dollar caps. Each row of the scenario becomes
            a horizontal pair (band → dollar). */}
        <div className="col-span-12 sm:col-span-7 sm:pl-2">
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div
                key={`${row.downBand}-${i}`}
                className="grid grid-cols-12 gap-4 items-baseline"
              >
                <div className="col-span-6 text-sm text-gray-700">
                  {row.downBand.split(' · ').map((part, j) => (
                    <p
                      key={j}
                      className={j === 0 ? '' : 'text-[11px] text-gray-500 mt-0.5'}
                    >
                      {part}
                    </p>
                  ))}
                </div>
                <div className="col-span-6 text-right">
                  {row.kind === 'unlimited' ? (
                    <span className="text-base font-semibold text-emerald-700">
                      Unlimited
                    </span>
                  ) : (
                    <span className="inline-flex items-baseline gap-2 justify-end">
                      <span className="text-base font-semibold text-brand-700">
                        {fmtUSD(roundForDisplay(((row.capPct ?? 0) * salePrice) / 100))}
                      </span>
                      <span className="text-[11px] font-medium text-brand-700/70">
                        {row.capPct}%
                      </span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {footnote && (
        <p className="text-[11px] text-gray-500 leading-relaxed mt-3 sm:ml-4">
          {footnote}
        </p>
      )}
    </div>
  );
}
