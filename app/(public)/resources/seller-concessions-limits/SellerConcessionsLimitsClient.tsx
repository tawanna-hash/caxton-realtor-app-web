'use client';

// app/(public)/resources/seller-concessions-limits/SellerConcessionsLimitsClient.tsx
//
// Public reference + calculator for seller's-concession (IPC) limits across
// Conventional, FHA, VA, and USDA loan programs. Two halves:
//   1. Calculator — pick program, occupancy, LTV; get the dollar cap on
//      what the seller (or any interested party) can credit toward the
//      buyer's closing costs / prepaids / points.
//   2. Full agency matrix — every band the calculator switches on, so
//      agents can scan it at a listing appointment.
//
// All math lives in lib/realtor-calc-math.ts (computeConcessionLimit +
// CONCESSION_MATRIX). This file is presentation only.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computeConcessionLimit,
  CONCESSION_MATRIX,
  type LoanProgram,
  type Occupancy,
} from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import { NumberField, SelectField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

// SelectField expects {v, l} option shape (see _components/CalcInputs).
const PROGRAM_OPTIONS: { v: LoanProgram; l: string }[] = [
  { v: 'conventional', l: 'Conventional (Fannie / Freddie)' },
  { v: 'fha', l: 'FHA' },
  { v: 'va', l: 'VA' },
  { v: 'usda', l: 'USDA' },
];

const OCCUPANCY_OPTIONS: { v: Occupancy; l: string }[] = [
  { v: 'primary', l: 'Primary residence' },
  { v: 'second_home', l: 'Second home' },
  { v: 'investment', l: 'Investment property' },
];

export default function SellerConcessionsLimitsClient() {
  const [program, setProgram] = useState<LoanProgram>('conventional');
  const [occupancy, setOccupancy] = useState<Occupancy>('primary');
  const [salePrice, setSalePrice] = useState(450000);
  const [downPct, setDownPct] = useState(10);

  // LTV is the inverse of down payment %, expressed as a percentage.
  const ltvPct = useMemo(
    () => Math.max(0, Math.min(100, 100 - downPct)),
    [downPct],
  );

  // VA/USDA require primary residence — gently coerce occupancy when the
  // user picks an incompatible program so the result stays meaningful.
  const effectiveOccupancy: Occupancy = useMemo(() => {
    if (program === 'va' || program === 'usda' || program === 'fha') {
      return 'primary';
    }
    return occupancy;
  }, [program, occupancy]);

  const result = useMemo(
    () =>
      computeConcessionLimit({
        program,
        occupancy: effectiveOccupancy,
        ltvPct,
        salePrice,
      }),
    [program, effectiveOccupancy, ltvPct, salePrice],
  );

  const programOnlyAllowsPrimary =
    program === 'fha' || program === 'va' || program === 'usda';

  const programLabel = PROGRAM_OPTIONS.find((p) => p.v === program)?.l ?? '';

  const buildReport = (): CalcReport => ({
    title: "Seller's Concession Limits",
    subtitle: `${programLabel} · ${occupancyLabel(effectiveOccupancy)} · LTV ${ltvPct.toFixed(2)}%`,
    heroLabel: `Maximum concession (${programLabel})`,
    heroValue: fmtUSD(result.capAmount),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Sale price', value: fmtUSD(salePrice) },
      { key: 'LTV', value: `${ltvPct.toFixed(2)}%` },
      { key: 'Down payment', value: `${downPct}%` },
      { key: 'Occupancy', value: occupancyLabel(effectiveOccupancy) },
    ],
    sections: [
      {
        heading: 'Result',
        rows: [
          { label: 'Concession cap', value: `${result.capPct}%`, emphasis: true },
          { label: 'Dollar amount', value: fmtUSD(result.capAmount), emphasis: true },
          { label: 'Basis', value: result.rule },
          { label: 'Citation', value: result.citation },
        ],
      },
      {
        heading: 'Reference matrix (all programs)',
        rows: CONCESSION_MATRIX.map((row) => ({
          label: `${row.programLabel} · ${row.occupancyLabel} · ${row.ltvBand}`,
          value: `${row.capPct}%`,
        })),
      },
    ],
    disclaimer:
      'Agency caps shown. Lender / investor overlays can be stricter. VA defines "concessions" more narrowly than the other agencies — the seller may also pay normal closing costs separately. Always confirm allowable structure with the lender before contract.',
    filename: `concession-limits-${program}`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Reference</p>
        <PageTitle>Seller&rsquo;s Concession Limits</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          The most the seller (or any interested party) can credit the
          buyer toward closing costs, prepaids, and discount points
          depends on the loan program, the occupancy, and on Conventional
          loans, the LTV. Use the calculator to size a credit before
          writing the offer, and the matrix below for a one-page reference.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6 print:hidden">
          <FieldGroup title="Loan & buyer">
            <SelectField<LoanProgram>
              label="Loan program"
              value={program}
              onChange={setProgram}
              options={PROGRAM_OPTIONS}
            />
            <SelectField<Occupancy>
              label="Occupancy"
              value={effectiveOccupancy}
              onChange={setOccupancy}
              options={OCCUPANCY_OPTIONS}
            />
            {programOnlyAllowsPrimary && (
              <p className="text-xs text-gray-500 -mt-2">
                {programLabel.split(' ')[0]} requires primary residence — occupancy is locked.
              </p>
            )}
          </FieldGroup>

          <FieldGroup title="Deal">
            <NumberField
              label="Sale price"
              value={salePrice}
              onChange={setSalePrice}
              prefix="$"
              step={1000}
            />
            <NumberField
              label="Down payment"
              value={downPct}
              onChange={setDownPct}
              suffix="%"
              step={0.5}
              hint={`LTV ${ltvPct.toFixed(2)}%`}
            />
          </FieldGroup>

          <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">A note on how lenders read this:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Concessions over the cap don&rsquo;t void the loan — the lender
                reduces the sale price (and therefore the LTV / loan amount)
                by the overage.
              </li>
              <li>
                On VA loans, the 4% cap covers items like prepaid taxes,
                escrow funding, gifts, and payoff of buyer debts. The seller
                may also pay normal closing costs <em>outside</em> the 4%.
              </li>
              <li>
                Investor overlays can be stricter than agency. Confirm with
                the lender before structuring an offer.
              </li>
            </ul>
          </div>
        </div>

        {/* ── Result card ────────────────────────────────────────── */}
        <div className="lg:col-span-2 print:col-span-5">
          <div className="lg:sticky lg:top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
            <p className={EYEBROW}>Maximum allowable concession</p>
            <p
              className="text-4xl text-gray-900 mb-1"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
            >
              {fmtUSD(result.capAmount)}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {result.capPct}% of {fmtUSD(salePrice)}
            </p>

            <div className="rounded-lg bg-[#1a2a44]/5 border border-[#1a2a44]/10 px-4 py-3 mb-4">
              <p className="text-[10px] uppercase tracking-wider text-[#1a2a44] font-semibold mb-1">
                Basis
              </p>
              <p className="text-sm text-gray-800 leading-snug">{result.rule}</p>
            </div>

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Details</p>
            <SubRow label="Program" value={programLabel.split(' ')[0]} />
            <SubRow label="Occupancy" value={occupancyLabel(effectiveOccupancy)} />
            <SubRow label="LTV" value={`${ltvPct.toFixed(2)}%`} />
            <SubRow label="Sale price" value={fmtUSD(salePrice)} />

            <hr className="border-gray-200 my-3" />
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
              Agency citation
            </p>
            <p className="text-[11px] text-gray-600 leading-relaxed">{result.citation}</p>

            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              Estimate based on agency rules. Lender / investor overlays
              may further restrict.
            </p>
          </div>
        </div>
      </div>

      {/* ── Matrix ─────────────────────────────────────────────────── */}
      <section className="mt-16">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a2a44] mb-3">
          Reference Matrix
        </p>
        <h2
          className="text-2xl md:text-3xl text-gray-900 mb-6"
          style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
        >
          Every concession cap, at a glance
        </h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <Th>Program</Th>
                <Th>Occupancy</Th>
                <Th>LTV band</Th>
                <Th className="text-right">Cap</Th>
                <Th>Notes</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {CONCESSION_MATRIX.map((row, i) => {
                const isActive =
                  row.program === program &&
                  row.occupancy === effectiveOccupancy &&
                  bandMatches(row.ltvBand, ltvPct);
                return (
                  <tr
                    key={`${row.program}-${row.occupancy}-${row.ltvBand}-${i}`}
                    className={isActive ? 'bg-[#1a2a44]/5' : 'bg-white'}
                  >
                    <Td className="font-medium text-gray-900">{row.programLabel}</Td>
                    <Td>{row.occupancyLabel}</Td>
                    <Td>{row.ltvBand}</Td>
                    <Td className="text-right font-semibold text-gray-900">
                      {row.capPct}%
                    </Td>
                    <Td className="text-xs text-gray-600">{row.notes ?? '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-4 leading-relaxed">
          Rows are agency caps. Highlighted row matches your current
          calculator inputs. Always check the lender&rsquo;s investor
          overlay before relying on the published agency maximum.
        </p>
      </section>

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

function occupancyLabel(o: Occupancy): string {
  switch (o) {
    case 'primary': return 'Primary residence';
    case 'second_home': return 'Second home';
    case 'investment': return 'Investment property';
  }
}

/**
 * Match a human-readable LTV band string against a numeric LTV. Bands
 * come from CONCESSION_MATRIX so they're a small known set.
 */
function bandMatches(band: string, ltv: number): boolean {
  if (band === 'Any LTV') return true;
  if (band === 'LTV ≤ 75%') return ltv <= 75;
  if (band === 'LTV 75.01% – 90%') return ltv > 75 && ltv <= 90;
  if (band === 'LTV > 90%') return ltv > 90;
  return false;
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1a2a44] mb-3">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-700 pl-3">
      <span>{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-gray-600 ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
