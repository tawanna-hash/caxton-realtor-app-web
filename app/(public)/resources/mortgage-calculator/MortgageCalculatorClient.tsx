'use client';

// app/(public)/resources/mortgage-calculator/MortgageCalculatorClient.tsx
//
// Realtor-grade mortgage calculator. Three tabs:
//   1. Payment    — PITI breakdown from home price + down + rate + escrow
//   2. Affordability — solve max price from income + debts + DTI
//   3. Amortization — year-by-year schedule with print/CSV
//
// All math is in lib/mortgage-math.ts. This file is purely UI + state.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computePiti,
  computeAffordability,
  amortize,
  fmtUSD,
  fmtPct,
  type PitiBreakdown,
  type AmortAnnualRow,
} from '@/lib/mortgage-math';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

type Tab = 'payment' | 'affordability' | 'amortization';

export default function MortgageCalculatorClient() {
  const [tab, setTab] = useState<Tab>('payment');

  // ── Shared loan inputs (used by Payment and Amortization tabs) ────
  const [homePrice, setHomePrice] = useState(450000);
  const [downPercent, setDownPercent] = useState(20);
  const [rate, setRate] = useState(6.75);
  const [termYears, setTermYears] = useState(30);
  const [annualTax, setAnnualTax] = useState(8100); // ~1.8% of $450k (TX avg)
  const [annualIns, setAnnualIns] = useState(1575); // ~0.35%
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [pmiRate, setPmiRate] = useState(0.5);

  const downPayment = useMemo(
    () => (homePrice * downPercent) / 100,
    [homePrice, downPercent]
  );

  const piti: PitiBreakdown = useMemo(
    () =>
      computePiti({
        homePrice,
        downPayment,
        annualRatePct: rate,
        termYears,
        annualPropertyTax: annualTax,
        annualInsurance: annualIns,
        monthlyHoa,
        pmiAnnualRatePct: pmiRate,
      }),
    [homePrice, downPayment, rate, termYears, annualTax, annualIns, monthlyHoa, pmiRate]
  );

  const amort = useMemo(
    () => amortize(piti.loanAmount, rate, termYears),
    [piti.loanAmount, rate, termYears]
  );

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className="mb-8">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle>Mortgage Calculator</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          Build buyer quotes in seconds. PITI breakdown, affordability
          analysis, and a year-by-year amortization schedule — all
          configured with Austin-area defaults (1.8% property tax, 0.35%
          insurance, 0.5% PMI when down payment is under 20%).
        </p>
      </header>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 mb-8 flex gap-1">
        {(
          [
            { id: 'payment', label: 'Monthly Payment' },
            { id: 'affordability', label: 'Affordability' },
            { id: 'amortization', label: 'Amortization' },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? 'border-[#1a2a44] text-[#1a2a44]'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────────── */}
      {tab === 'payment' && (
        <PaymentTab
          homePrice={homePrice}
          setHomePrice={setHomePrice}
          downPercent={downPercent}
          setDownPercent={setDownPercent}
          downPayment={downPayment}
          rate={rate}
          setRate={setRate}
          termYears={termYears}
          setTermYears={setTermYears}
          annualTax={annualTax}
          setAnnualTax={setAnnualTax}
          annualIns={annualIns}
          setAnnualIns={setAnnualIns}
          monthlyHoa={monthlyHoa}
          setMonthlyHoa={setMonthlyHoa}
          pmiRate={pmiRate}
          setPmiRate={setPmiRate}
          piti={piti}
        />
      )}

      {tab === 'affordability' && <AffordabilityTab />}

      {tab === 'amortization' && (
        <AmortizationTab
          loanAmount={piti.loanAmount}
          annualRatePct={rate}
          termYears={termYears}
          annual={amort.annual}
          totalInterest={amort.totalInterest}
        />
      )}

      {/* ── Footer note ───────────────────────────────────────────── */}
      <p className="text-xs text-gray-500 mt-12 leading-relaxed">
        Estimates only. Actual rates, taxes, insurance, and PMI vary by
        lender, property, and borrower profile. Not a loan offer, pre-approval,
        or guarantee. Confirm all figures with a licensed lender before
        relying on them in a purchase decision.
      </p>
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — Monthly Payment / PITI
// ═══════════════════════════════════════════════════════════════════════════

interface PaymentTabProps {
  homePrice: number;
  setHomePrice: (n: number) => void;
  downPercent: number;
  setDownPercent: (n: number) => void;
  downPayment: number;
  rate: number;
  setRate: (n: number) => void;
  termYears: number;
  setTermYears: (n: number) => void;
  annualTax: number;
  setAnnualTax: (n: number) => void;
  annualIns: number;
  setAnnualIns: (n: number) => void;
  monthlyHoa: number;
  setMonthlyHoa: (n: number) => void;
  pmiRate: number;
  setPmiRate: (n: number) => void;
  piti: PitiBreakdown;
}

function PaymentTab(p: PaymentTabProps) {
  return (
    <div className="grid lg:grid-cols-5 gap-8">
      {/* Inputs */}
      <div className="lg:col-span-3 space-y-5">
        <NumberField
          label="Home price"
          value={p.homePrice}
          onChange={p.setHomePrice}
          prefix="$"
          step={1000}
        />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField
            label="Down payment"
            value={p.downPercent}
            onChange={p.setDownPercent}
            suffix="%"
            step={0.5}
            hint={fmtUSD(p.downPayment)}
          />
          <NumberField
            label="Interest rate"
            value={p.rate}
            onChange={p.setRate}
            suffix="%"
            step={0.125}
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <SelectField
            label="Loan term"
            value={p.termYears}
            onChange={p.setTermYears}
            options={[
              { v: 15, l: '15 years' },
              { v: 20, l: '20 years' },
              { v: 25, l: '25 years' },
              { v: 30, l: '30 years' },
            ]}
          />
          <NumberField
            label="PMI rate (when applicable)"
            value={p.pmiRate}
            onChange={p.setPmiRate}
            suffix="%"
            step={0.05}
            hint={p.piti.pmi > 0 ? 'Applied (LTV > 80%)' : 'Not applied'}
          />
        </div>
        <hr className="border-gray-200" />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField
            label="Annual property tax"
            value={p.annualTax}
            onChange={p.setAnnualTax}
            prefix="$"
            step={100}
            hint={
              p.homePrice > 0
                ? `${((p.annualTax / p.homePrice) * 100).toFixed(2)}% of price`
                : undefined
            }
          />
          <NumberField
            label="Annual insurance"
            value={p.annualIns}
            onChange={p.setAnnualIns}
            prefix="$"
            step={50}
          />
        </div>
        <NumberField
          label="Monthly HOA"
          value={p.monthlyHoa}
          onChange={p.setMonthlyHoa}
          prefix="$"
          step={10}
        />
      </div>

      {/* PITI breakdown card */}
      <div className="lg:col-span-2">
        <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className={EYEBROW}>Estimated Monthly Payment</p>
          <p
            className="text-4xl text-gray-900 mb-1"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
          >
            {fmtUSD(p.piti.total)}
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Loan amount {fmtUSD(p.piti.loanAmount)} · LTV {fmtPct(p.piti.ltv, 0)}
          </p>

          <dl className="space-y-2.5 text-sm">
            <Row label="Principal & Interest" value={p.piti.principalAndInterest} />
            <Row label="Property tax" value={p.piti.propertyTax} />
            <Row label="Insurance" value={p.piti.insurance} />
            {p.piti.pmi > 0 && <Row label="PMI" value={p.piti.pmi} />}
            {p.piti.hoa > 0 && <Row label="HOA" value={p.piti.hoa} />}
          </dl>

          <hr className="border-gray-200 my-4" />
          <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
            <span>Total PITI</span>
            <span>{fmtUSD(p.piti.total)}</span>
          </div>

          {/* Stacked bar — visual breakdown */}
          <PitiBar piti={p.piti} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-gray-700">
      <span>{label}</span>
      <span className="font-medium text-gray-900">{fmtUSD(value, { cents: true })}</span>
    </div>
  );
}

function PitiBar({ piti }: { piti: PitiBreakdown }) {
  const total = piti.total || 1;
  const segs = [
    { key: 'pi', label: 'P&I', value: piti.principalAndInterest, color: '#1a2a44' },
    { key: 'tax', label: 'Tax', value: piti.propertyTax, color: '#3b5b8a' },
    { key: 'ins', label: 'Ins', value: piti.insurance, color: '#7b9bcc' },
    { key: 'pmi', label: 'PMI', value: piti.pmi, color: '#c4a35a' },
    { key: 'hoa', label: 'HOA', value: piti.hoa, color: '#a3a3a3' },
  ].filter((s) => s.value > 0);
  return (
    <div className="mt-5">
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {segs.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${fmtUSD(s.value, { cents: true })}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            {s.label} {Math.round((s.value / total) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — Affordability
// ═══════════════════════════════════════════════════════════════════════════

function AffordabilityTab() {
  const [income, setIncome] = useState(120000);
  const [debts, setDebts] = useState(500);
  const [down, setDown] = useState(50000);
  const [rate, setRate] = useState(6.75);
  const [term, setTerm] = useState(30);
  const [frontDti, setFrontDti] = useState(28);
  const [backDti, setBackDti] = useState(36);
  const [hoa, setHoa] = useState(0);

  const result = useMemo(
    () =>
      computeAffordability({
        annualIncome: income,
        monthlyDebts: debts,
        downPayment: down,
        annualRatePct: rate,
        termYears: term,
        frontEndRatio: frontDti / 100,
        backEndRatio: backDti / 100,
        monthlyHoa: hoa,
      }),
    [income, debts, down, rate, term, frontDti, backDti, hoa]
  );

  return (
    <div className="grid lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3 space-y-5">
        <NumberField label="Annual gross income" value={income} onChange={setIncome} prefix="$" step={1000} />
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField label="Monthly debt payments" value={debts} onChange={setDebts} prefix="$" step={50} hint="Cars, student loans, credit cards" />
          <NumberField label="Down payment" value={down} onChange={setDown} prefix="$" step={1000} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <NumberField label="Interest rate" value={rate} onChange={setRate} suffix="%" step={0.125} />
          <SelectField
            label="Loan term"
            value={term}
            onChange={setTerm}
            options={[
              { v: 15, l: '15 years' },
              { v: 20, l: '20 years' },
              { v: 30, l: '30 years' },
            ]}
          />
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <NumberField label="Front-end DTI cap" value={frontDti} onChange={setFrontDti} suffix="%" step={1} hint="Housing / income" />
          <NumberField label="Back-end DTI cap" value={backDti} onChange={setBackDti} suffix="%" step={1} hint="Total debt / income" />
          <NumberField label="Monthly HOA" value={hoa} onChange={setHoa} prefix="$" step={10} />
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className={EYEBROW}>Estimated Max Price</p>
          <p
            className="text-4xl text-gray-900 mb-1"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
          >
            {fmtUSD(result.maxHomePrice)}
          </p>
          <p className="text-xs text-gray-500 mb-5">
            Loan up to {fmtUSD(result.maxLoanAmount)} · binding constraint:{' '}
            <span className="font-medium">{result.bindingRatio}</span>
          </p>

          <dl className="space-y-2.5 text-sm">
            <Row label="Max monthly housing" value={result.maxMonthlyHousing} />
            <div className="flex items-center justify-between text-gray-700">
              <span>Front-end cap ({frontDti}%)</span>
              <span className="font-medium text-gray-900">
                {fmtUSD(((income / 12) * frontDti) / 100, { cents: true })}
              </span>
            </div>
            <div className="flex items-center justify-between text-gray-700">
              <span>Back-end cap ({backDti}%)</span>
              <span className="font-medium text-gray-900">
                {fmtUSD(Math.max(0, ((income / 12) * backDti) / 100 - debts), { cents: true })}
              </span>
            </div>
          </dl>

          <div className="mt-4 text-[11px] text-gray-500 leading-relaxed">
            Includes estimated 1.8% property tax + 0.35% insurance + HOA. Excludes
            PMI — model that in the Payment tab if down payment is below 20%.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — Amortization
// ═══════════════════════════════════════════════════════════════════════════

interface AmortizationTabProps {
  loanAmount: number;
  annualRatePct: number;
  termYears: number;
  annual: AmortAnnualRow[];
  totalInterest: number;
}

function AmortizationTab(p: AmortizationTabProps) {
  const totalPaid = p.loanAmount + p.totalInterest;

  function downloadCsv() {
    const header = 'Year,Principal Paid,Interest Paid,Ending Balance\n';
    const body = p.annual
      .map(
        (r) =>
          `${r.year},${r.principalPaid.toFixed(2)},${r.interestPaid.toFixed(
            2
          )},${r.endingBalance.toFixed(2)}`
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `amortization-${p.termYears}yr-${Math.round(p.loanAmount)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Top stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Loan amount" value={fmtUSD(p.loanAmount)} />
        <StatCard label="Total interest paid" value={fmtUSD(p.totalInterest)} accent />
        <StatCard label="Total of payments" value={fmtUSD(totalPaid)} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">
          Annual breakdown · {p.termYears}-year term @ {p.annualRatePct}%
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:border-[#1a2a44] hover:text-[#1a2a44] transition"
          >
            Download CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:border-[#1a2a44] hover:text-[#1a2a44] transition"
          >
            Print
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-2.5">Year</th>
              <th className="text-right px-4 py-2.5">Principal Paid</th>
              <th className="text-right px-4 py-2.5">Interest Paid</th>
              <th className="text-right px-4 py-2.5">Ending Balance</th>
            </tr>
          </thead>
          <tbody>
            {p.annual.map((row) => (
              <tr key={row.year} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-700">{row.year}</td>
                <td className="px-4 py-2 text-right text-gray-900">
                  {fmtUSD(row.principalPaid, { cents: true })}
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {fmtUSD(row.interestPaid, { cents: true })}
                </td>
                <td className="px-4 py-2 text-right text-gray-900 font-medium">
                  {fmtUSD(row.endingBalance, { cents: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({
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

// ═══════════════════════════════════════════════════════════════════════════
// Form primitives
// ═══════════════════════════════════════════════════════════════════════════

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
}

function NumberField({ label, value, onChange, prefix, suffix, step = 1, hint }: NumberFieldProps) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
            {prefix}
          </span>
        )}
        <input
          type="number"
          value={value}
          step={step}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1a2a44] focus:outline-none focus:ring-1 focus:ring-[#1a2a44]/30 ${
            prefix ? 'pl-7' : ''
          } ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

interface SelectFieldProps<T extends number | string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { v: T; l: string }[];
}

function SelectField<T extends number | string>({
  label,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          const coerced = (typeof options[0].v === 'number' ? Number(raw) : raw) as T;
          onChange(coerced);
        }}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1a2a44] focus:outline-none focus:ring-1 focus:ring-[#1a2a44]/30 bg-white"
      >
        {options.map((o) => (
          <option key={String(o.v)} value={String(o.v)}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
