'use client';

// app/(public)/resources/rent-vs-buy/RentVsBuyClient.tsx
//
// Rent vs. Buy — year-by-year cumulative cost comparison.
// Highlights the breakeven year (where buying nets ahead).

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import { computeRentVsBuy, type RentVsBuyResult } from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import { NumberField, SelectField } from '../_components/CalcInputs';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

export default function RentVsBuyClient() {
  // Buying
  const [homePrice, setHomePrice] = useState(450000);
  const [downPct, setDownPct] = useState(20);
  const [rate, setRate] = useState(6.75);
  const [termYears, setTermYears] = useState(30);
  const [closingCosts, setClosingCosts] = useState(12000);
  const [annualTax, setAnnualTax] = useState(8100);
  const [annualIns, setAnnualIns] = useState(1575);
  const [hoa, setHoa] = useState(0);
  const [appreciation, setAppreciation] = useState(3);
  const [maintenance, setMaintenance] = useState(1);
  const [sellingCost, setSellingCost] = useState(8);

  // Renting
  const [rent, setRent] = useState(2400);
  const [rentIncrease, setRentIncrease] = useState(4);
  const [rentersIns, setRentersIns] = useState(20);
  const [securityDeposit, setSecurityDeposit] = useState(2400);

  const [horizon, setHorizon] = useState(10);

  const downPayment = useMemo(() => (homePrice * downPct) / 100, [homePrice, downPct]);

  const result: RentVsBuyResult = useMemo(
    () =>
      computeRentVsBuy({
        homePrice,
        downPayment,
        annualRatePct: rate,
        termYears,
        closingCosts,
        annualPropertyTax: annualTax,
        annualInsurance: annualIns,
        monthlyHoa: hoa,
        appreciationPct: appreciation,
        maintenancePct: maintenance,
        sellingCostPct: sellingCost,
        monthlyRent: rent,
        rentIncreasePct: rentIncrease,
        rentersInsurance: rentersIns,
        securityDeposit,
        horizonYears: horizon,
      }),
    [
      homePrice, downPayment, rate, termYears, closingCosts,
      annualTax, annualIns, hoa, appreciation, maintenance, sellingCost,
      rent, rentIncrease, rentersIns, securityDeposit, horizon,
    ]
  );

  // For the bar chart — biggest cumulative number sets the scale.
  const maxValue = useMemo(() => {
    let m = 0;
    for (const r of result.rows) {
      if (r.buyNetCost > m) m = r.buyNetCost;
      if (r.rentCost > m) m = r.rentCost;
    }
    return m || 1;
  }, [result.rows]);

  const finalRow = result.rows[result.rows.length - 1];

  const buildReport = (): CalcReport => ({
    title: 'Rent vs. Buy',
    subtitle: `${fmtUSD(homePrice)} home · ${downPct}% down · ${rate}% / ${termYears}yr · ${fmtUSD(rent)}/mo rent · ${horizon}yr horizon`,
    heroLabel: 'Breakeven year',
    heroValue:
      result.breakevenYear !== null ? `Year ${result.breakevenYear}` : 'Beyond horizon',
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Horizon', value: `${horizon} years` },
      { key: 'Final buy cost', value: fmtUSD(finalRow.buyNetCost) },
      { key: 'Final rent cost', value: fmtUSD(finalRow.rentCost) },
    ],
    sections: [
      {
        heading: 'Assumptions',
        rows: [
          { label: 'Home price', value: fmtUSD(homePrice) },
          { label: 'Down payment', value: `${fmtUSD(downPayment)} (${downPct}%)` },
          { label: 'Rate / term', value: `${rate}% / ${termYears}yr` },
          { label: 'Closing costs', value: fmtUSD(closingCosts) },
          { label: 'Annual property tax', value: fmtUSD(annualTax) },
          { label: 'Annual insurance', value: fmtUSD(annualIns) },
          ...(hoa > 0 ? [{ label: 'Monthly HOA', value: fmtUSD(hoa) }] : []),
          { label: 'Appreciation', value: `${appreciation}%/yr` },
          { label: 'Maintenance', value: `${maintenance}%/yr of home value` },
          { label: 'Selling cost', value: `${sellingCost}% of sale` },
          { label: 'Starting rent', value: `${fmtUSD(rent)}/mo` },
          { label: 'Rent increase', value: `${rentIncrease}%/yr` },
          { label: "Renter's insurance", value: `${fmtUSD(rentersIns)}/mo` },
        ],
      },
      {
        heading: 'Year-by-year cumulative cost',
        rows: result.rows.map((r) => ({
          label: `Year ${r.year}${r.year === result.breakevenYear ? ' — breakeven' : ''}`,
          value: `Buy ${fmtUSD(r.buyNetCost)} · Rent ${fmtUSD(r.rentCost)} · Diff ${fmtUSD(r.rentCost - r.buyNetCost)}`,
          emphasis: r.year === result.breakevenYear,
        })),
      },
      {
        heading: `After ${horizon} years`,
        rows: [
          { label: 'Total buy net cost', value: fmtUSD(finalRow.buyNetCost) },
          { label: 'Total rent cost', value: fmtUSD(finalRow.rentCost) },
          {
            label: finalRow.buyNetCost < finalRow.rentCost ? 'Buying saves' : 'Renting saves',
            value: fmtUSD(Math.abs(finalRow.rentCost - finalRow.buyNetCost)),
            emphasis: true,
          },
        ],
      },
    ],
    disclaimer:
      'Estimates only. Does not model tax deductibility (mortgage interest, SALT cap, standard deduction), opportunity cost of the down payment if invested elsewhere, or moves/refinances mid-horizon. Use as a starting point in the buyer consult, not as financial advice.',
    filename: `rent-vs-buy-${horizon}yr-${Math.round(homePrice / 1000)}k`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-32 print:pb-12">
      <header className="mb-10">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle>Rent vs. Buy</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Should your client rent or buy? Projects year-by-year cumulative
          cost — including mortgage interest, taxes, insurance, HOA,
          maintenance, and exit costs against renting with annual
          escalators — then finds the breakeven year where buying nets
          ahead.
        </p>
      </header>

      {/* ── Summary card ───────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          label="Breakeven year"
          value={
            result.breakevenYear !== null
              ? `Year ${result.breakevenYear}`
              : 'Beyond horizon'
          }
          accent={result.breakevenYear !== null}
        />
        {finalRow && (
          <>
            <SummaryCard
              label={`Buy net cost · year ${finalRow.year}`}
              value={fmtUSD(finalRow.buyNetCost)}
            />
            <SummaryCard
              label={`Rent total · year ${finalRow.year}`}
              value={fmtUSD(finalRow.rentCost)}
            />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ──────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <FieldGroup title="Buy">
            <NumberField label="Home price" value={homePrice} onChange={setHomePrice} prefix="$" step={1000} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Down" value={downPct} onChange={setDownPct} suffix="%" step={0.5} hint={fmtUSD(downPayment)} />
              <NumberField label="Rate" value={rate} onChange={setRate} suffix="%" step={0.125} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Term"
                value={termYears}
                onChange={setTermYears}
                options={[
                  { v: 15, l: '15 years' },
                  { v: 20, l: '20 years' },
                  { v: 30, l: '30 years' },
                ]}
              />
              <NumberField label="Closing costs" value={closingCosts} onChange={setClosingCosts} prefix="$" step={500} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Annual tax" value={annualTax} onChange={setAnnualTax} prefix="$" step={100} />
              <NumberField label="Annual ins" value={annualIns} onChange={setAnnualIns} prefix="$" step={50} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="HOA/mo" value={hoa} onChange={setHoa} prefix="$" step={10} />
              <NumberField label="Apprec." value={appreciation} onChange={setAppreciation} suffix="%" step={0.5} hint="per yr" />
              <NumberField label="Maint." value={maintenance} onChange={setMaintenance} suffix="%" step={0.25} hint="of value/yr" />
            </div>
            <NumberField
              label="Selling costs at exit"
              value={sellingCost}
              onChange={setSellingCost}
              suffix="%"
              step={0.5}
              hint="Commission + closing"
            />
          </FieldGroup>

          <FieldGroup title="Rent">
            <NumberField label="Monthly rent" value={rent} onChange={setRent} prefix="$" step={50} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Annual increase" value={rentIncrease} onChange={setRentIncrease} suffix="%" step={0.5} />
              <NumberField label="Renters ins/mo" value={rentersIns} onChange={setRentersIns} prefix="$" step={5} />
            </div>
            <NumberField label="Security deposit" value={securityDeposit} onChange={setSecurityDeposit} prefix="$" step={100} />
          </FieldGroup>

          <FieldGroup title="Horizon">
            <SelectField
              label="Projection years"
              value={horizon}
              onChange={setHorizon}
              options={[
                { v: 3, l: '3 years' },
                { v: 5, l: '5 years' },
                { v: 7, l: '7 years' },
                { v: 10, l: '10 years' },
                { v: 15, l: '15 years' },
                { v: 20, l: '20 years' },
                { v: 30, l: '30 years' },
              ]}
            />
          </FieldGroup>
        </div>

        {/* ── Chart + Table ───────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1a2a44] mb-4">
              Year-by-year — cumulative cost
            </p>
            <div className="space-y-2">
              {result.rows.map((r) => {
                const buyWidth = (r.buyNetCost / maxValue) * 100;
                const rentWidth = (r.rentCost / maxValue) * 100;
                const buyWins = r.buyNetCost <= r.rentCost;
                return (
                  <div key={r.year} className="text-xs">
                    <div className="flex items-baseline justify-between mb-0.5">
                      <span className="text-gray-600 w-12">Year {r.year}</span>
                      <span className="text-gray-500">
                        {buyWins ? 'buy ahead' : 'rent ahead'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-right text-[#1a2a44] font-medium">Buy</span>
                      <div className="flex-1 h-3.5 bg-gray-100 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-[#1a2a44]"
                          style={{ width: `${Math.max(0, buyWidth)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-gray-700">
                        {fmtUSD(r.buyNetCost)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="w-10 text-right text-[#c4a35a] font-medium">Rent</span>
                      <div className="flex-1 h-3.5 bg-gray-100 rounded-sm overflow-hidden">
                        <div
                          className="h-full bg-[#c4a35a]"
                          style={{ width: `${Math.max(0, rentWidth)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right text-gray-700">
                        {fmtUSD(r.rentCost)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Year</th>
                  <th className="text-right px-3 py-2">Home Value</th>
                  <th className="text-right px-3 py-2">Loan Balance</th>
                  <th className="text-right px-3 py-2">Net Equity</th>
                  <th className="text-right px-3 py-2">Buy Net</th>
                  <th className="text-right px-3 py-2">Rent Total</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => {
                  const isBreakeven = r.year === result.breakevenYear;
                  return (
                    <tr
                      key={r.year}
                      className={`border-t border-gray-100 ${
                        isBreakeven ? 'bg-[#c4a35a]/10' : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 text-gray-700">
                        {r.year}
                        {isBreakeven && (
                          <span className="ml-1.5 text-[10px] text-[#c4a35a] font-semibold uppercase">
                            breakeven
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{fmtUSD(r.homeValue)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{fmtUSD(r.loanBalance)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{fmtUSD(r.netEquity)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{fmtUSD(r.buyNetCost)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{fmtUSD(r.rentCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed">
        Estimates only. Doesn&apos;t model tax deductibility (mortgage interest,
        SALT cap, standard deduction), opportunity cost of the down payment if
        invested elsewhere, or moves/refinances mid-horizon. Use as a starting
        point in the buyer consult, not as financial advice.
      </p>

      <ResourceFloater
        shareTitle="Rent vs. Buy — RealtyLine Austin"
        shareText="Year-by-year rent vs. buy with breakeven analysis."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1a2a44] mb-3">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        accent ? 'border-[#c4a35a]/40 bg-[#c4a35a]/5' : 'border-gray-200 bg-white'
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p
        className="text-2xl text-gray-900"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
      >
        {value}
      </p>
    </div>
  );
}
