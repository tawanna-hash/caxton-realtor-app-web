'use client';

// app/(public)/resources/buyer-closing-costs/BuyerClosingCostsClient.tsx
//
// Buyer-side closing-cost estimator. Mirrors CD page-2 sections A/B/C/E/F
// plus credits, and surfaces the all-in cash-to-close number.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computeBuyerClosing,
  type BuyerClosingBreakdown,
} from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import { NumberField, DateField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

function defaultClosing(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function BuyerClosingCostsClient() {
  // Loan basics
  const [homePrice, setHomePrice] = useState(450000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(6.75);
  const [closingDate, setClosingDate] = useState<string>(defaultClosing());
  const [annualIns, setAnnualIns] = useState(1575);
  const [annualTax, setAnnualTax] = useState(8100);

  // Section A — lender
  const [originationPct, setOriginationPct] = useState(1);
  const [pointsPct, setPointsPct] = useState(0);
  const [lenderFlatFees, setLenderFlatFees] = useState(1200); // underwriting + processing + admin

  // Section B — services
  const [appraisalFee, setAppraisalFee] = useState(600);
  const [creditReportFee, setCreditReportFee] = useState(75);
  const [lendersTitlePolicy, setLendersTitlePolicy] = useState(150);
  const [titleServices, setTitleServices] = useState(450);

  // Section C — taxes/recording
  const [recordingFees, setRecordingFees] = useState(150);

  // Section E — prepaids
  const [prepaidInsMonths, setPrepaidInsMonths] = useState(12);

  // Section F — escrow setup
  const [escrowInsMonths, setEscrowInsMonths] = useState(2);
  const [escrowTaxMonths, setEscrowTaxMonths] = useState(3);

  // Credits
  const [sellerCredit, setSellerCredit] = useState(0);
  const [lenderCredit, setLenderCredit] = useState(0);
  const [earnestMoney, setEarnestMoney] = useState(5000);

  const downPayment = useMemo(() => (homePrice * downPct) / 100, [homePrice, downPct]);

  const result: BuyerClosingBreakdown = useMemo(
    () =>
      computeBuyerClosing({
        homePrice,
        downPayment,
        annualRatePct: rate,
        annualInsurance: annualIns,
        annualPropertyTax: annualTax,
        closingDate,
        originationPct,
        pointsPct,
        lenderFlatFees,
        appraisalFee,
        creditReportFee,
        lendersTitlePolicy,
        titleServices,
        recordingFees,
        prepaidInsMonths,
        escrowInsMonths,
        escrowTaxMonths,
        sellerCredit,
        lenderCredit,
        earnestMoney,
      }),
    [
      homePrice, downPayment, rate, annualIns, annualTax, closingDate,
      originationPct, pointsPct, lenderFlatFees,
      appraisalFee, creditReportFee, lendersTitlePolicy, titleServices,
      recordingFees, prepaidInsMonths, escrowInsMonths, escrowTaxMonths,
      sellerCredit, lenderCredit, earnestMoney,
    ]
  );

  const buildReport = (): CalcReport => ({
    title: 'Buyer Closing Costs',
    subtitle: `${fmtUSD(homePrice)} home · ${downPct}% down · ${rate}% interest · closing ${closingDate}`,
    heroLabel: 'Cash to close',
    heroValue: fmtUSD(result.cashToClose),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Loan amount', value: fmtUSD(result.loanAmount) },
      { key: 'Down payment', value: fmtUSD(downPayment) },
      { key: 'Closing date', value: closingDate },
    ],
    sections: [
      {
        heading: 'A — Origination',
        rows: [
          { label: `Origination (${originationPct}%)`, value: fmtUSD(result.origination) },
          { label: `Discount points (${pointsPct}%)`, value: fmtUSD(result.points) },
          { label: 'Other lender fees', value: fmtUSD(result.lenderFlatFees) },
        ],
      },
      {
        heading: 'B — Services',
        rows: [
          { label: 'Appraisal', value: fmtUSD(result.appraisalFee) },
          { label: 'Credit report', value: fmtUSD(result.creditReportFee) },
          { label: "Lender's title policy", value: fmtUSD(result.lendersTitlePolicy) },
          { label: 'Title services', value: fmtUSD(result.titleServices) },
        ],
      },
      {
        heading: 'C — Taxes & gov\u2019t',
        rows: [{ label: 'Recording fees', value: fmtUSD(result.recordingFees) }],
      },
      {
        heading: 'E — Prepaids',
        rows: [
          { label: `Prepaid interest (${result.prepaidInterestDays}d)`, value: fmtUSD(result.prepaidInterest) },
          { label: 'Insurance prepaid', value: fmtUSD(result.prepaidInsurance) },
        ],
      },
      {
        heading: 'F — Escrow setup',
        rows: [
          { label: 'Insurance in escrow', value: fmtUSD(result.escrowInsurance) },
          { label: 'Tax in escrow', value: fmtUSD(result.escrowTax) },
        ],
      },
      {
        heading: 'Totals',
        rows: [
          { label: 'Total closing costs', value: fmtUSD(result.totalClosingCosts), emphasis: true },
          { label: 'Down payment', value: fmtUSD(downPayment) },
          ...(result.totalCredits > 0
            ? [{ label: 'Credits & earnest', value: `−${fmtUSD(result.totalCredits)}`, negative: true }]
            : []),
          { label: 'Cash to close', value: fmtUSD(result.cashToClose), emphasis: true },
        ],
      },
    ],
    disclaimer:
      'Estimates only. Lender fees, title rates, and prepaid amounts vary by lender, loan program (Conventional, FHA, VA), property, and timing. Confirm with the lender\u2019s Loan Estimate / Closing Disclosure before relying on these figures.',
    filename: `buyer-closing-${closingDate}`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle>Buyer Closing Costs</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          Estimate everything your buyer brings to the closing table. Lender
          fees, title services, prepaids, and escrow setup — sectioned to match
          a Texas Closing Disclosure so the line items are familiar to the
          lender. Surfaces total <em>cash-to-close</em> after credits.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6 print:hidden">
          {/* Loan basics */}
          <FieldGroup title="Loan basics">
            <NumberField label="Home price" value={homePrice} onChange={setHomePrice} prefix="$" step={1000} />
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Down payment"
                value={downPct}
                onChange={setDownPct}
                suffix="%"
                step={0.5}
                hint={fmtUSD(downPayment)}
              />
              <NumberField label="Interest rate" value={rate} onChange={setRate} suffix="%" step={0.125} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Annual insurance" value={annualIns} onChange={setAnnualIns} prefix="$" step={50} />
              <NumberField label="Annual property tax" value={annualTax} onChange={setAnnualTax} prefix="$" step={100} />
            </div>
            <DateField
              label="Estimated closing date"
              value={closingDate}
              onChange={setClosingDate}
              hint={`${result.prepaidInterestDays} day(s) prepaid interest`}
            />
          </FieldGroup>

          {/* A — Origination */}
          <FieldGroup title="A — Origination">
            <div className="grid sm:grid-cols-3 gap-4">
              <NumberField label="Origination" value={originationPct} onChange={setOriginationPct} suffix="%" step={0.125} />
              <NumberField label="Discount points" value={pointsPct} onChange={setPointsPct} suffix="%" step={0.125} />
              <NumberField label="Other lender fees" value={lenderFlatFees} onChange={setLenderFlatFees} prefix="$" step={50} />
            </div>
          </FieldGroup>

          {/* B — Services */}
          <FieldGroup title="B — Services">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Appraisal" value={appraisalFee} onChange={setAppraisalFee} prefix="$" step={25} />
              <NumberField label="Credit report" value={creditReportFee} onChange={setCreditReportFee} prefix="$" step={5} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Lender's title policy" value={lendersTitlePolicy} onChange={setLendersTitlePolicy} prefix="$" step={25} hint="TX promulgated rate (low)" />
              <NumberField label="Title services / endorsements" value={titleServices} onChange={setTitleServices} prefix="$" step={25} />
            </div>
          </FieldGroup>

          {/* C — Taxes */}
          <FieldGroup title="C — Taxes & Gov't">
            <NumberField label="Recording fees" value={recordingFees} onChange={setRecordingFees} prefix="$" step={10} />
          </FieldGroup>

          {/* E — Prepaids */}
          <FieldGroup title="E — Prepaids">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Insurance months prepaid"
                value={prepaidInsMonths}
                onChange={setPrepaidInsMonths}
                suffix="mo"
                step={1}
                hint="Usually 12"
              />
              <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
                Prepaid interest computed from closing date<br />
                <span className="font-medium text-gray-800">{fmtUSD(result.prepaidInterest, { cents: true })}</span> · {result.prepaidInterestDays} day(s)
              </div>
            </div>
          </FieldGroup>

          {/* F — Escrow setup */}
          <FieldGroup title="F — Escrow Setup">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Insurance months in escrow" value={escrowInsMonths} onChange={setEscrowInsMonths} suffix="mo" step={1} hint="Usually 2–3" />
              <NumberField label="Tax months in escrow" value={escrowTaxMonths} onChange={setEscrowTaxMonths} suffix="mo" step={1} hint="Usually 2–3" />
            </div>
          </FieldGroup>

          {/* Credits */}
          <FieldGroup title="Credits">
            <div className="grid sm:grid-cols-3 gap-4">
              <NumberField label="Seller credit" value={sellerCredit} onChange={setSellerCredit} prefix="$" step={500} />
              <NumberField label="Lender credit" value={lenderCredit} onChange={setLenderCredit} prefix="$" step={250} />
              <NumberField label="Earnest money" value={earnestMoney} onChange={setEarnestMoney} prefix="$" step={500} />
            </div>
          </FieldGroup>
        </div>

        {/* ── Result card ────────────────────────────────────────── */}
        <div className="lg:col-span-2 print:col-span-5">
          <div className="lg:sticky lg:top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
            <p className={EYEBROW}>Estimated Cash to Close</p>
            <p
              className="text-4xl text-gray-900 mb-1"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
            >
              {fmtUSD(result.cashToClose)}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              Loan {fmtUSD(result.loanAmount)} · DP {fmtUSD(downPayment)}
            </p>

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">A — Origination</p>
            <SubRow label="Origination" value={result.origination} />
            <SubRow label="Discount points" value={result.points} />
            <SubRow label="Other lender fees" value={result.lenderFlatFees} />

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-2">B — Services</p>
            <SubRow label="Appraisal" value={result.appraisalFee} />
            <SubRow label="Credit report" value={result.creditReportFee} />
            <SubRow label="Lender's title policy" value={result.lendersTitlePolicy} />
            <SubRow label="Title services" value={result.titleServices} />

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-2">C — Taxes</p>
            <SubRow label="Recording fees" value={result.recordingFees} />

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-2">E — Prepaids</p>
            <SubRow label={`Prepaid interest (${result.prepaidInterestDays}d)`} value={result.prepaidInterest} />
            <SubRow label="Insurance prepaid" value={result.prepaidInsurance} />

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-2">F — Escrow</p>
            <SubRow label="Insurance in escrow" value={result.escrowInsurance} />
            <SubRow label="Tax in escrow" value={result.escrowTax} />

            <hr className="border-gray-200 my-3" />
            <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
              <span>Total closing costs</span>
              <span>{fmtUSD(result.totalClosingCosts)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700 mt-1">
              <span>+ Down payment</span>
              <span>{fmtUSD(downPayment)}</span>
            </div>
            {result.totalCredits > 0 && (
              <div className="flex items-center justify-between text-sm text-rose-700 mt-1">
                <span>− Credits & earnest</span>
                <span>−{fmtUSD(result.totalCredits)}</span>
              </div>
            )}

            <hr className="border-gray-200 my-3" />
            <div className="flex items-center justify-between text-base font-semibold text-gray-900">
              <span>Cash to close</span>
              <span>{fmtUSD(result.cashToClose)}</span>
            </div>

            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              Estimate only. Final numbers come from the lender&apos;s Loan
              Estimate / Closing Disclosure.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed print:hidden">
        Estimates only. Lender fees, title rates, and prepaid amounts vary by
        lender, loan program (Conventional, FHA, VA), property, and timing.
        Confirm with the lender&apos;s Loan Estimate before relying on these
        figures.
      </p>

      <ResourceFloater
        shareTitle="Buyer Closing Costs — RealtyLine Austin"
        shareText="Cash-to-close estimator with Texas CD line items."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#021D40] mb-3">
        {title}
      </p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-700 pl-3">
      <span>{label}</span>
      <span className="font-medium text-gray-900">{fmtUSD(value, { cents: true })}</span>
    </div>
  );
}
