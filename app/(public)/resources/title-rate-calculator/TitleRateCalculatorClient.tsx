'use client';

// app/(public)/resources/title-rate-calculator/TitleRateCalculatorClient.tsx
//
// Texas title insurance rate calculator. Mirrors the FNF/Austin Title rate
// calculator at https://ratecalculator.fnf.com/?id=austintitle but rendered
// in RealtyLine's own design (Georgia serif headings, gold accents).
//
// Math lives in lib/tx-title-math.ts and uses the authoritative TDI
// March 1, 2026 Basic Premium Rate Schedule. Because Texas rates are
// promulgated, every title underwriter charges identical premiums for
// the basic policies — this estimator therefore matches FNF, Stewart,
// Old Republic, Chicago Title, and every other agent's calculator
// (modulo escrow/closing fee variation, which is not promulgated).

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import { fmtUSD } from '@/lib/mortgage-math';
import {
  quoteTitleRates,
  type ReissueAge,
  type TitleQuoteResult,
  type TitleTransactionType,
} from '@/lib/tx-title-math';
import { NumberField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

export default function TitleRateCalculatorClient() {
  const [transactionType, setTransactionType] =
    useState<TitleTransactionType>('purchase');
  const [salesPrice, setSalesPrice] = useState(450_000);
  const [loanAmount, setLoanAmount] = useState(360_000);
  const [reissueAge, setReissueAge] = useState<ReissueAge>('within-4yr');

  // Endorsement toggles
  const [residential, setResidential] = useState(true);
  const [t19_1, setT19_1] = useState(true);
  const [t19, setT19] = useState(true);
  const [t30, setT30] = useState(true);
  const [surveyDeletion, setSurveyDeletion] = useState(true);

  // Optional pass-through fees
  const [escrowFee, setEscrowFee] = useState(350);
  const [recordingFees, setRecordingFees] = useState(125);

  const result: TitleQuoteResult = useMemo(
    () =>
      quoteTitleRates({
        transactionType,
        salesPrice,
        loanAmount,
        reissueAge,
        endorsements: { t19_1, t19, t30, surveyDeletion, residential },
        escrowFee,
        recordingFees,
        guarantyAssessment: 0, // use default ($4.50 per policy)
      }),
    [
      transactionType,
      salesPrice,
      loanAmount,
      reissueAge,
      t19_1,
      t19,
      t30,
      surveyDeletion,
      residential,
      escrowFee,
      recordingFees,
    ],
  );

  const policyLines = result.lines.filter(
    (l) => l.code !== 'TOTAL' && l.code !== 'Escrow' && l.code !== 'Recording' && l.code !== 'TGA',
  );
  const closingFeeLines = result.lines.filter(
    (l) => l.code === 'Escrow' || l.code === 'Recording' || l.code === 'TGA',
  );

  const buildReport = (): CalcReport => ({
    title: 'Texas Title Rate Estimate',
    subtitle:
      transactionType === 'purchase'
        ? `${fmtUSD(salesPrice)} purchase \u00b7 ${loanAmount > 0 ? `${fmtUSD(loanAmount)} loan` : 'cash purchase'}`
        : `${fmtUSD(loanAmount)} refinance \u00b7 ${reissueAgeLabel(reissueAge)}`,
    heroLabel: 'Estimated total at closing',
    heroValue: fmtUSD(result.total, { cents: true }),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Schedule', value: 'TDI — Eff. Mar 1, 2026' },
      { key: 'Property type', value: residential ? 'Residential' : 'Non-residential' },
      {
        key: 'Transaction',
        value: transactionType === 'purchase' ? 'Purchase' : 'Refinance (R-8)',
      },
    ],
    sections: [
      {
        heading: 'Title insurance & endorsements',
        rows: policyLines.map((l) => ({
          label: l.label,
          value: fmtUSD(l.amount, { cents: true }),
        })),
      },
      {
        heading: 'Closing fees',
        rows: closingFeeLines.map((l) => ({
          label: l.label,
          value: fmtUSD(l.amount, { cents: true }),
        })),
      },
      {
        heading: 'Bottom line',
        rows: [
          {
            label: 'Estimated total at closing',
            value: fmtUSD(result.total, { cents: true }),
            emphasis: true,
          },
        ],
      },
    ],
    disclaimer:
      "Estimate only. Texas title insurance premiums are promulgated by the Texas Department of Insurance (effective March 1, 2026). The exact figures on your Closing Disclosure may differ slightly due to rounding, optional endorsements, and the specific escrow / closing fee charged by your title company. Confirm with your title company before closing.",
    filename: `tx-title-${transactionType}-${Math.round(salesPrice / 1000)}k`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle size="md">Texas Title Rate Calculator</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Texas title insurance is{' '}
          <span className="font-medium text-gray-900">promulgated</span> — the
          Texas Department of Insurance sets one schedule and every title
          underwriter charges the same premium. This estimator uses the
          official schedule effective{' '}
          <span className="font-medium text-gray-900">March 1, 2026</span>,
          including the R-5 simultaneous issue rule and the R-8 refinance
          reissue credit.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          {/* Transaction type */}
          <div>
            <span className="block text-sm font-medium text-gray-800 mb-2">
              Transaction type
            </span>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
              {(['purchase', 'refinance'] as TitleTransactionType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTransactionType(t)}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    transactionType === t
                      ? 'bg-[#301D5D] text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {t === 'purchase' ? 'Purchase' : 'Refinance'}
                </button>
              ))}
            </div>
          </div>

          {/* Property type — affects endorsement pricing */}
          <div>
            <span className="block text-sm font-medium text-gray-800 mb-2">
              Property type
            </span>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
              <button
                type="button"
                onClick={() => setResidential(true)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  residential ? 'bg-[#301D5D] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Residential
              </button>
              <button
                type="button"
                onClick={() => setResidential(false)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  !residential ? 'bg-[#301D5D] text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Non-residential
              </button>
            </div>
            <span className="block text-xs text-gray-500 mt-1">
              Affects endorsement rates (T-19 / T-19.1 / area-boundary).
            </span>
          </div>

          {/* Purchase / refinance specific inputs */}
          {transactionType === 'purchase' ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Sales price"
                value={salesPrice}
                onChange={setSalesPrice}
                prefix="$"
                step={1000}
              />
              <NumberField
                label="Loan amount"
                value={loanAmount}
                onChange={setLoanAmount}
                prefix="$"
                step={1000}
                hint="0 for cash purchase"
              />
            </div>
          ) : (
            <>
              <NumberField
                label="New loan amount"
                value={loanAmount}
                onChange={setLoanAmount}
                prefix="$"
                step={1000}
              />
              <div>
                <span className="block text-sm font-medium text-gray-800 mb-2">
                  Age of prior insured loan (R-8 credit)
                </span>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: 'within-4yr', label: 'Within 4 yrs (50% credit)' },
                      { v: '4-to-8yr', label: '4–8 yrs (25% credit)' },
                      { v: 'over-8yr', label: 'Over 8 yrs (no credit)' },
                      { v: 'none', label: 'No prior policy' },
                    ] as { v: ReissueAge; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setReissueAge(opt.v)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition ${
                        reissueAge === opt.v
                          ? 'border-[#301D5D] bg-[#301D5D] text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <span className="block text-xs text-gray-500 mt-2">
                  R-8 credits apply when the new loan fully satisfies a prior
                  loan that was insured by a TX Loan Policy.
                </span>
              </div>
            </>
          )}

          {/* Endorsements */}
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <p className={EYEBROW}>Endorsements</p>
            <p className="text-sm text-gray-600 mb-4">
              Check the boxes for endorsements requested at closing. Standard
              Texas residential purchase typically includes T-19, T-19.1, T-30,
              and an area-boundary (survey) deletion.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Toggle
                label="T-19.1 — Restrictions, Encroachments, Minerals (Owner)"
                checked={t19_1}
                onChange={setT19_1}
                disabled={transactionType === 'refinance'}
                hint={
                  transactionType === 'refinance'
                    ? 'Owner-side endorsement — N/A on refinance'
                    : residential
                      ? '10% of basic rate (5% with survey deletion)'
                      : '15% of basic rate (10% with survey deletion)'
                }
              />
              <Toggle
                label="T-19 — Restrictions, Encroachments, Minerals (Loan)"
                checked={t19}
                onChange={setT19}
                hint={residential ? '5% of basic rate (min $50)' : '10% of basic rate (min $50)'}
              />
              <Toggle
                label="T-30 — Tax Deletion (Loan)"
                checked={t30}
                onChange={setT30}
                hint="Flat $5 per R-19"
              />
              <Toggle
                label="T-3 — Area & Boundary deletion (Owner)"
                checked={surveyDeletion}
                onChange={setSurveyDeletion}
                disabled={transactionType === 'refinance'}
                hint={
                  transactionType === 'refinance'
                    ? 'Owner-side endorsement — N/A on refinance'
                    : residential
                      ? '5% of basic rate (min $20)'
                      : '15% of basic rate (min $20)'
                }
              />
            </div>
          </div>

          {/* Closing fees */}
          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Escrow / closing fee"
              value={escrowFee}
              onChange={setEscrowFee}
              prefix="$"
              step={25}
              hint="Set by title company — ~$350 typical in Austin"
            />
            <NumberField
              label="Recording fees"
              value={recordingFees}
              onChange={setRecordingFees}
              prefix="$"
              step={5}
              hint="County clerk recording — ~$125 typical"
            />
          </div>
        </div>

        {/* ── Result card ────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="sticky top-6 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <p className={EYEBROW}>Estimated Total</p>
            <p
              className="text-4xl text-gray-900 mb-1"
            >
              {fmtUSD(result.total, { cents: true })}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {transactionType === 'purchase'
                ? `${fmtUSD(salesPrice)} sale · ${loanAmount > 0 ? `${fmtUSD(loanAmount)} loan` : 'cash'}`
                : `${fmtUSD(loanAmount)} refinance · ${reissueAgeLabel(reissueAge)}`}
            </p>

            <dl className="space-y-2.5 text-sm">
              {result.ownerPolicy > 0 && (
                <Row label="Owner's Title Policy" value={result.ownerPolicy} />
              )}
              {result.lenderPolicy > 0 && (
                <Row
                  label={
                    transactionType === 'purchase'
                      ? "Lender's Policy (R-5)"
                      : "Lender's Policy (R-8)"
                  }
                  value={result.lenderPolicy}
                />
              )}
              {result.endorsements.map((e) => (
                <Row key={e.code} label={`${e.code} ${shortEndorsement(e.code)}`} value={e.amount} muted />
              ))}
              {escrowFee > 0 && <Row label="Escrow / closing fee" value={escrowFee} muted />}
              {result.guarantyAssessment > 0 && (
                <Row label="TX Guaranty Assessment" value={result.guarantyAssessment} muted />
              )}
              {recordingFees > 0 && <Row label="Recording fees" value={recordingFees} muted />}
            </dl>

            <hr className="border-gray-200 my-4" />
            <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
              <span>Total at closing</span>
              <span>{fmtUSD(result.total, { cents: true })}</span>
            </div>

            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              In a standard Texas purchase, the{' '}
              <span className="font-medium text-gray-700">seller</span>{' '}
              customarily pays the owner&apos;s policy and the{' '}
              <span className="font-medium text-gray-700">buyer</span> pays the
              lender&apos;s policy + endorsements. Allocation is negotiable in
              the contract.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed max-w-3xl">
        Estimate only. Texas title insurance premiums are{' '}
        <span className="font-medium text-gray-700">promulgated</span> by the
        Texas Department of Insurance — every TX title company charges the
        identical premium for the basic owner&apos;s and lender&apos;s policies.
        Rates above use the schedule effective March 1, 2026
        (
        <a
          href="https://www.tdi.texas.gov/title/documents/titlerates2026.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[#301D5D]"
        >
          TDI titlerates2026.pdf
        </a>
        ). Escrow / closing fees and recording fees are not promulgated and
        vary by title company. Confirm exact figures on your Closing Disclosure
        with your title company.
      </p>

      <ResourceFloater
        shareTitle="Texas Title Rate Calculator — RealtyLine Austin"
        shareText="Promulgated TX title premium estimator — owner's, lender's, R-5, R-8, and endorsements."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

function reissueAgeLabel(age: ReissueAge): string {
  switch (age) {
    case 'within-4yr':
      return 'Prior policy ≤ 4 yrs (50% R-8 credit)';
    case '4-to-8yr':
      return 'Prior policy 4–8 yrs (25% R-8 credit)';
    case 'over-8yr':
      return 'Prior policy > 8 yrs (no credit)';
    case 'none':
      return 'No prior insured policy';
  }
}

function shortEndorsement(code: string): string {
  switch (code) {
    case 'T-19.1':
      return '(Owner)';
    case 'T-19':
      return '(Loan)';
    case 'T-30':
      return '(Tax)';
    case 'T-3':
      return '(Survey)';
    default:
      return '';
  }
}

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        muted ? 'text-gray-500' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span className={`font-medium ${muted ? 'text-gray-600' : 'text-gray-900'}`}>
        {fmtUSD(value, { cents: true })}
      </span>
    </div>
  );
}

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}

function Toggle({ label, checked, onChange, hint, disabled = false }: ToggleProps) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md border px-3 py-2.5 transition ${
        disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : checked
            ? 'border-[#301D5D] bg-[#301D5D]/[0.03] cursor-pointer'
            : 'border-gray-300 bg-white hover:bg-gray-50 cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded-md border-gray-400 text-[#301D5D] focus:ring-[#301D5D]/30"
      />
      <span className="flex-1">
        <span className="block text-sm font-medium text-gray-900 leading-snug">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
