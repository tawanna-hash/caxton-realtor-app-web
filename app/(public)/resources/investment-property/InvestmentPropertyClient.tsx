'use client';

// app/(public)/resources/investment-property/InvestmentPropertyClient.tsx
//
// Investment property ROI / cash-flow calculator.
// Surfaces cap rate, cash-on-cash, NOI, DSCR, GRM and the industry
// rule-of-thumb checks (1% rule, 50% rule).

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computeInvestment,
  type InvestmentBreakdown,
} from '@/lib/realtor-calc-math';
import { fmtUSD, fmtPct } from '@/lib/mortgage-math';
import { NumberField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

export default function InvestmentPropertyClient() {
  // Acquisition
  const [purchasePrice, setPurchasePrice] = useState(300000);
  const [downPct, setDownPct] = useState(25);
  const [closingCosts, setClosingCosts] = useState(6000);
  const [initialRepairs, setInitialRepairs] = useState(3500);

  // Financing
  const [rate, setRate] = useState(7.25);
  const [termYears, setTermYears] = useState(30);

  // Income
  const [monthlyRent, setMonthlyRent] = useState(2400);
  const [otherMonthlyIncome, setOtherMonthlyIncome] = useState(0);
  const [vacancyPct, setVacancyPct] = useState(5);

  // Fixed operating costs
  const [annualPropertyTax, setAnnualPropertyTax] = useState(5400);
  const [annualInsurance, setAnnualInsurance] = useState(1800);
  const [monthlyHoa, setMonthlyHoa] = useState(0);

  // Variable operating costs (% of EGI)
  const [propMgmtPct, setPropMgmtPct] = useState(8);
  const [maintenancePct, setMaintenancePct] = useState(5);
  const [capExPct, setCapExPct] = useState(5);

  // Other monthly op-ex
  const [monthlyUtilities, setMonthlyUtilities] = useState(0);
  const [otherMonthlyOpEx, setOtherMonthlyOpEx] = useState(0);

  const downPayment = useMemo(
    () => (purchasePrice * downPct) / 100,
    [purchasePrice, downPct]
  );

  const result: InvestmentBreakdown = useMemo(
    () =>
      computeInvestment({
        purchasePrice,
        downPayment,
        closingCosts,
        initialRepairs,
        annualRatePct: rate,
        termYears,
        monthlyRent,
        otherMonthlyIncome,
        vacancyPct,
        annualPropertyTax,
        annualInsurance,
        monthlyHoa,
        propMgmtPct,
        maintenancePct,
        capExPct,
        monthlyUtilities,
        otherMonthlyOpEx,
      }),
    [
      purchasePrice, downPayment, closingCosts, initialRepairs,
      rate, termYears,
      monthlyRent, otherMonthlyIncome, vacancyPct,
      annualPropertyTax, annualInsurance, monthlyHoa,
      propMgmtPct, maintenancePct, capExPct,
      monthlyUtilities, otherMonthlyOpEx,
    ]
  );

  const cashFlowPositive = result.monthlyCashFlow >= 0;

  const buildReport = (): CalcReport => ({
    title: 'Investment Property ROI',
    subtitle: `${fmtUSD(purchasePrice)} purchase · ${fmtUSD(monthlyRent)}/mo rent`,
    heroLabel: 'Monthly cash flow',
    heroValue: fmtUSD(result.monthlyCashFlow, { cents: true }),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Cap rate', value: fmtPct(result.capRate) },
      { key: 'Cash-on-cash', value: fmtPct(result.cashOnCash) },
      { key: 'DSCR', value: result.dscr.toFixed(2) },
    ],
    sections: [
      {
        heading: 'Returns',
        rows: [
          { label: 'Monthly cash flow', value: fmtUSD(result.monthlyCashFlow, { cents: true }), emphasis: true, negative: !cashFlowPositive },
          { label: 'Annual cash flow', value: fmtUSD(result.annualCashFlow, { cents: true }), negative: result.annualCashFlow < 0 },
          { label: 'NOI (annual)', value: fmtUSD(result.noi, { cents: true }) },
          { label: 'Cap rate', value: fmtPct(result.capRate) },
          { label: 'Cash-on-cash', value: fmtPct(result.cashOnCash) },
          { label: 'GRM', value: result.grm.toFixed(2) },
          { label: 'DSCR', value: result.dscr.toFixed(2) },
          { label: '1% rule', value: result.onePctRuleMet ? 'Met' : 'Not met' },
          { label: '50% rule', value: result.fiftyPctRuleMet ? 'Met' : 'Not met' },
        ],
      },
      {
        heading: 'Acquisition & financing',
        rows: [
          { label: 'Purchase price', value: fmtUSD(purchasePrice) },
          { label: 'Down payment', value: `${fmtUSD(downPayment)} (${downPct}%)` },
          { label: 'Loan amount', value: fmtUSD(result.loanAmount) },
          { label: 'Rate / term', value: `${rate}% / ${termYears}yr` },
          { label: 'Closing costs', value: fmtUSD(closingCosts) },
          { label: 'Initial repairs', value: fmtUSD(initialRepairs) },
          { label: 'Total cash invested', value: fmtUSD(result.totalCashInvested), emphasis: true },
          { label: 'Annual debt service', value: fmtUSD(result.annualDebtService) },
        ],
      },
      {
        heading: 'Income (annual)',
        rows: [
          { label: 'Gross monthly rent', value: fmtUSD(result.grossMonthlyRent) },
          { label: 'Gross annual rent', value: fmtUSD(result.grossAnnualRent) },
          { label: `Vacancy (${vacancyPct}%)`, value: `-${fmtUSD(result.vacancyLoss)}`, negative: true },
          { label: 'Effective gross income', value: fmtUSD(result.effectiveGrossIncome), emphasis: true },
        ],
      },
      {
        heading: 'Operating expenses (annual)',
        rows: [
          { label: 'Property tax', value: fmtUSD(result.propertyTax) },
          { label: 'Insurance', value: fmtUSD(result.insurance) },
          ...(result.hoa > 0 ? [{ label: 'HOA', value: fmtUSD(result.hoa) }] : []),
          { label: `Property mgmt (${propMgmtPct}% EGI)`, value: fmtUSD(result.propMgmt) },
          { label: `Maintenance (${maintenancePct}% EGI)`, value: fmtUSD(result.maintenance) },
          { label: `CapEx reserve (${capExPct}% EGI)`, value: fmtUSD(result.capEx) },
          ...(result.utilities > 0 ? [{ label: 'Utilities', value: fmtUSD(result.utilities) }] : []),
          ...(result.otherOpEx > 0 ? [{ label: 'Other op-ex', value: fmtUSD(result.otherOpEx) }] : []),
          { label: 'Total operating expenses', value: fmtUSD(result.totalOpEx), emphasis: true },
        ],
      },
    ],
    disclaimer:
      'Estimates only. Underwriting must use the actual lender quote, verified rents (PM rent comps), and a property-specific tax/insurance/HOA quote. Rule-of-thumb checks (1% rule, 50% rule) are screening heuristics, not underwriting standards.',
    filename: `investment-roi-${Math.round(purchasePrice)}`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle size="md">Investment Property ROI</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          Run cash flow, cap rate, cash-on-cash return, NOI, and DSCR on a
          single-family or small multifamily rental. Includes the 1% rule
          and 50% rule sanity checks investors lean on for back-of-envelope
          underwriting.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6 print:hidden">
          <FieldGroup title="Acquisition">
            <NumberField label="Purchase price" value={purchasePrice} onChange={setPurchasePrice} prefix="$" step={1000} />
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField
                label="Down payment"
                value={downPct}
                onChange={setDownPct}
                suffix="%"
                step={0.5}
                hint={fmtUSD(downPayment)}
              />
              <NumberField label="Loan term" value={termYears} onChange={setTermYears} suffix="yr" step={5} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Closing costs" value={closingCosts} onChange={setClosingCosts} prefix="$" step={250} />
              <NumberField label="Initial repairs" value={initialRepairs} onChange={setInitialRepairs} prefix="$" step={250} />
            </div>
            <NumberField label="Interest rate" value={rate} onChange={setRate} suffix="%" step={0.125} />
          </FieldGroup>

          <FieldGroup title="Income">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Monthly rent" value={monthlyRent} onChange={setMonthlyRent} prefix="$" step={25} />
              <NumberField label="Other income (laundry, pet, etc.)" value={otherMonthlyIncome} onChange={setOtherMonthlyIncome} prefix="$" step={25} />
            </div>
            <NumberField
              label="Vacancy reserve"
              value={vacancyPct}
              onChange={setVacancyPct}
              suffix="%"
              step={0.5}
              hint="% of gross rent — Austin SFR usually 5–8%"
            />
          </FieldGroup>

          <FieldGroup title="Fixed operating costs">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Annual property tax" value={annualPropertyTax} onChange={setAnnualPropertyTax} prefix="$" step={100} />
              <NumberField label="Annual insurance" value={annualInsurance} onChange={setAnnualInsurance} prefix="$" step={50} />
            </div>
            <NumberField label="Monthly HOA" value={monthlyHoa} onChange={setMonthlyHoa} prefix="$" step={10} />
          </FieldGroup>

          <FieldGroup title="Variable reserves (% of effective gross income)">
            <div className="grid sm:grid-cols-3 gap-4">
              <NumberField label="Property mgmt" value={propMgmtPct} onChange={setPropMgmtPct} suffix="%" step={0.5} hint="0 if self-managed" />
              <NumberField label="Maintenance" value={maintenancePct} onChange={setMaintenancePct} suffix="%" step={0.5} />
              <NumberField label="CapEx reserve" value={capExPct} onChange={setCapExPct} suffix="%" step={0.5} />
            </div>
          </FieldGroup>

          <FieldGroup title="Other monthly op-ex">
            <div className="grid sm:grid-cols-2 gap-4">
              <NumberField label="Utilities (landlord-paid)" value={monthlyUtilities} onChange={setMonthlyUtilities} prefix="$" step={10} />
              <NumberField label="Other monthly op-ex" value={otherMonthlyOpEx} onChange={setOtherMonthlyOpEx} prefix="$" step={10} />
            </div>
          </FieldGroup>
        </div>

        {/* ── Result card ────────────────────────────────────────── */}
        <div className="lg:col-span-2 print:col-span-5">
          <div className="lg:sticky lg:top-6 rounded-md border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
            <div className="flex items-start justify-between mb-1">
              <p className={EYEBROW}>Monthly Cash Flow</p>
              <button
                type="button"
                onClick={() => window.print()}
                className="text-xs px-3 py-1 border border-gray-300 rounded-md hover:border-[#021D40] hover:text-[#021D40] transition print:hidden"
              >
                Print
              </button>
            </div>
            <p
              className={`text-4xl mb-1 ${cashFlowPositive ? 'text-gray-900' : 'text-rose-700'}`}
            >
              {fmtUSD(result.monthlyCashFlow)}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {fmtUSD(result.annualCashFlow)} / yr · Loan {fmtUSD(result.loanAmount)} · Cash in {fmtUSD(result.totalCashInvested)}
            </p>

            {/* Headline ratios */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <RatioTile label="Cap rate" value={fmtPct(result.capRate)} accent />
              <RatioTile label="Cash-on-cash" value={fmtPct(result.cashOnCash)} accent />
              <RatioTile label="DSCR" value={result.dscr.toFixed(2)} />
              <RatioTile label="GRM" value={result.grm.toFixed(1)} />
            </div>

            {/* Rule of thumb badges */}
            <div className="flex flex-wrap gap-2 mb-5">
              <RuleBadge
                met={result.onePctRuleMet}
                label={`1% rule (${(result.rentToPriceRatio * 100).toFixed(2)}%)`}
              />
              <RuleBadge
                met={result.fiftyPctRuleMet}
                label="50% rule"
              />
            </div>

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Income (annual)</p>
            <SubRow label="Gross rent" value={result.grossAnnualRent} />
            <SubRow label="− Vacancy" value={-result.vacancyLoss} negative />
            <SubRow label="Effective gross income" value={result.effectiveGrossIncome} bold />

            <p className="text-[10px] uppercase tracking-wider text-gray-500 mt-3 mb-2">Operating expenses (annual)</p>
            <SubRow label="Property tax" value={result.propertyTax} />
            <SubRow label="Insurance" value={result.insurance} />
            {result.hoa > 0 && <SubRow label="HOA" value={result.hoa} />}
            <SubRow label="Property mgmt" value={result.propMgmt} />
            <SubRow label="Maintenance" value={result.maintenance} />
            <SubRow label="CapEx reserve" value={result.capEx} />
            {result.utilities > 0 && <SubRow label="Utilities" value={result.utilities} />}
            {result.otherOpEx > 0 && <SubRow label="Other op-ex" value={result.otherOpEx} />}
            <SubRow label="Total op-ex" value={result.totalOpEx} bold />

            <hr className="border-gray-200 my-3" />
            <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
              <span>NOI</span>
              <span>{fmtUSD(result.noi)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-700 mt-1">
              <span>− Debt service</span>
              <span>−{fmtUSD(result.annualDebtService)}</span>
            </div>

            <hr className="border-gray-200 my-3" />
            <div className={`flex items-center justify-between text-base font-semibold ${cashFlowPositive ? 'text-gray-900' : 'text-rose-700'}`}>
              <span>Annual cash flow</span>
              <span>{fmtUSD(result.annualCashFlow)}</span>
            </div>

            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              Estimates only. Excludes income taxes, depreciation, and
              future rent growth. Always pencil a deal with the investor&apos;s
              actual lender quote and a local PM&apos;s rent comp.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed print:hidden">
        Rule-of-thumb shortcuts: <strong>1% rule</strong> — monthly rent ≥ 1%
        of purchase price (gut check for cash flow). <strong>50% rule</strong>{' '}
        — operating expenses (excl. debt service) ≤ 50% of gross rent. These
        are screening heuristics, not underwriting standards.
      </p>

      <ResourceFloater
        shareTitle="Investment Property ROI — RealtyLine Austin"
        shareText="Run cash flow, cap rate, cash-on-cash, NOI and DSCR on any rental."
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

function RatioTile({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${accent ? 'border-[#fb923c]/40 bg-[#fb923c]/5' : 'border-gray-200 bg-gray-50'}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p
        className="text-lg text-gray-900"
      >
        {value}
      </p>
    </div>
  );
}

function RuleBadge({ met, label }: { met: boolean; label: string }) {
  return (
    <span
      className={`text-[11px] px-2.5 py-1 rounded-full border ${
        met
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      {met ? '✓ ' : '✗ '}{label}
    </span>
  );
}

function SubRow({
  label,
  value,
  bold = false,
  negative = false,
}: {
  label: string;
  value: number;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm pl-3 ${
        bold ? 'font-semibold text-gray-900 mt-1' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span
        className={`${bold ? '' : 'font-medium'} ${
          negative ? 'text-rose-700' : 'text-gray-900'
        }`}
      >
        {fmtUSD(value)}
      </span>
    </div>
  );
}
