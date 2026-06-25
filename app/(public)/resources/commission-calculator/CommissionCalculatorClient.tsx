'use client';

// app/(public)/resources/commission-calculator/CommissionCalculatorClient.tsx
//
// Commission calculator — given a sale price, total commission rate, and the
// agent's split with their broker, breaks down side commission, referral,
// broker take, and agent take-home.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import { computeCommission, type CommissionBreakdown } from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

type Side = 'listing' | 'buyer';

export default function CommissionCalculatorClient() {
  const [salePrice, setSalePrice] = useState(450000);
  const [totalRate, setTotalRate] = useState(6);
  const [listingShare, setListingShare] = useState(50);
  const [agentSplit, setAgentSplit] = useState(70);
  const [brokerFlat, setBrokerFlat] = useState(395);
  const [referral, setReferral] = useState(0);
  const [side, setSide] = useState<Side>('listing');

  const result: CommissionBreakdown = useMemo(
    () =>
      computeCommission({
        salePrice,
        totalRatePct: totalRate,
        listingSharePct: listingShare,
        agentSplitPct: agentSplit,
        brokerFlatFee: brokerFlat,
        referralPct: referral,
        side,
      }),
    [salePrice, totalRate, listingShare, agentSplit, brokerFlat, referral, side]
  );

  const buildReport = (): CalcReport => ({
    title: 'Commission Calculator',
    subtitle: `${fmtUSD(salePrice)} sale · ${totalRate}% commission · ${side === 'listing' ? 'Listing side' : 'Buyer side'}`,
    heroLabel: 'Your net take-home',
    heroValue: fmtUSD(result.agentNet),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      { key: 'Side', value: side === 'listing' ? 'Listing side' : 'Buyer side' },
      { key: 'Agent split', value: `${agentSplit}%` },
      { key: '% of sale', value: `${((result.agentNet / salePrice) * 100).toFixed(2)}%` },
    ],
    sections: [
      {
        heading: 'Commission → take-home',
        rows: [
          { label: `Total commission (${totalRate}%)`, value: fmtUSD(result.totalCommission) },
          { label: `Your side (${side}, ${side === 'listing' ? listingShare : 100 - listingShare}%)`, value: fmtUSD(result.sideCommission) },
          ...(result.referralAmount > 0
            ? [{ label: `Referral out (${referral}%)`, value: `−${fmtUSD(result.referralAmount)}`, negative: true }]
            : []),
          { label: 'After referral', value: fmtUSD(result.afterReferral), emphasis: true },
          { label: `Your gross split (${agentSplit}%)`, value: fmtUSD(result.agentGross) },
          ...(result.brokerFlatFee > 0
            ? [{ label: 'Broker flat fee', value: `−${fmtUSD(result.brokerFlatFee)}`, negative: true }]
            : []),
          { label: 'Net to you', value: fmtUSD(result.agentNet), emphasis: true },
          { label: 'Broker keeps', value: fmtUSD(result.brokerSplit) },
        ],
      },
    ],
    disclaimer:
      'Estimates only. Commission structures, broker splits, and referral arrangements vary by brokerage and transaction. Confirm exact figures with your broker\u2019s commission disbursement authorization (CDA). Does not deduct self-employment / income tax.',
    filename: `commission-${side}-${Math.round(salePrice / 1000)}k`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle size="md">Commission Calculator</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4">
          From sale price to take-home. Models total commission, side split,
          optional referral fee, broker split, and broker flat fee — so you
          know your number before you write the offer.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          {/* Side toggle */}
          <div>
            <span className="block text-sm font-medium text-gray-800 mb-2">
              Which side?
            </span>
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
              {(['listing', 'buyer'] as Side[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  className={`px-4 py-2 text-sm font-medium transition ${
                    side === s
                      ? 'bg-brand-700 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {s === 'listing' ? 'Listing side' : 'Buyer side'}
                </button>
              ))}
            </div>
          </div>

          <NumberField
            label="Sale price"
            value={salePrice}
            onChange={setSalePrice}
            prefix="$"
            step={1000}
          />

          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Total commission rate"
              value={totalRate}
              onChange={setTotalRate}
              suffix="%"
              step={0.25}
              hint="Combined both sides"
            />
            <NumberField
              label="Listing side share"
              value={listingShare}
              onChange={setListingShare}
              suffix="%"
              step={1}
              hint={`Buyer side gets ${100 - listingShare}%`}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Agent split with broker"
              value={agentSplit}
              onChange={setAgentSplit}
              suffix="%"
              step={1}
              hint={`Broker keeps ${100 - agentSplit}%`}
            />
            <NumberField
              label="Broker flat fee"
              value={brokerFlat}
              onChange={setBrokerFlat}
              prefix="$"
              step={5}
              hint="Transaction fee, E&O, etc."
            />
          </div>

          <NumberField
            label="Referral fee"
            value={referral}
            onChange={setReferral}
            suffix="%"
            step={5}
            hint="As % of your side commission. 0 if none."
          />
        </div>

        {/* ── Result card ────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="sticky top-6 rounded-md border border-gray-200 bg-white p-6 shadow-sm">
            <p className={EYEBROW}>Your Take-Home</p>
            <p
              className="text-4xl text-gray-900 mb-1"
            >
              {fmtUSD(result.agentNet)}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              {side === 'listing' ? 'Listing' : 'Buyer'} side ·{' '}
              {((result.agentNet / salePrice) * 100).toFixed(2)}% of sale
            </p>

            <dl className="space-y-2.5 text-sm">
              <Row label="Total commission" value={result.totalCommission} muted />
              <Row label={`Your side (${side})`} value={result.sideCommission} />
              {result.referralAmount > 0 && (
                <Row label="− Referral out" value={-result.referralAmount} />
              )}
              <Row label="Net after referral" value={result.afterReferral} muted />
              <Row label="Your gross split" value={result.agentGross} />
              {result.brokerFlatFee > 0 && (
                <Row label="− Broker flat fee" value={-result.brokerFlatFee} />
              )}
            </dl>

            <hr className="border-gray-200 my-4" />
            <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
              <span>Agent take-home</span>
              <span>{fmtUSD(result.agentNet)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
              <span>Broker keeps</span>
              <span>{fmtUSD(result.brokerSplit)}</span>
            </div>

            <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
              Pre-tax. Doesn&apos;t include MLS dues, brand fees, or self-employment
              tax. For planning purposes only.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed">
        Estimates only. Commission structures, broker splits, and referral
        arrangements vary by brokerage and transaction. Confirm exact figures
        with your broker&apos;s commission disbursement authorization (CDA) before
        relying on them.
      </p>

      <ResourceFloater
        shareTitle="Commission Calculator — RealtyLine Austin"
        shareText="Sale price to take-home — model side split, referral, and broker fees."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div
      className={`flex items-center justify-between ${
        muted ? 'text-gray-500' : 'text-gray-700'
      }`}
    >
      <span>{label}</span>
      <span
        className={`font-medium ${
          isNeg ? 'text-rose-700' : muted ? 'text-gray-600' : 'text-gray-900'
        }`}
      >
        {isNeg ? '−' : ''}
        {fmtUSD(Math.abs(value), { cents: true })}
      </span>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  hint?: string;
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  hint,
}: NumberFieldProps) {
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
          className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700/30 ${
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
