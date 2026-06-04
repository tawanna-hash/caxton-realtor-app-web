'use client';

// app/(public)/resources/seller-net-sheet/SellerNetSheetClient.tsx
//
// Seller net sheet — Texas standard line items. Prints cleanly so agents
// can hand it to the seller at the listing appointment.

import { useMemo, useState } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import {
  computeNetSheet,
  estimateTxTitlePolicy,
  dayOfYear,
  type NetSheetBreakdown,
} from '@/lib/realtor-calc-math';
import { fmtUSD } from '@/lib/mortgage-math';
import ResourceFloater from '../_components/ResourceFloater';
import { reportTimestamp, type CalcReport } from '../_components/calcPdf';

const EYEBROW = 'text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2';

// Counties within ~60 miles of downtown Austin (78701). Covers the 5-county
// Austin MSA (Bastrop, Caldwell, Hays, Travis, Williamson) plus Hill Country
// neighbors (Blanco, Burnet, Comal, Llano) and the eastern ring (Fayette,
// Lee, Milam). Alphabetical.
const CLOSING_COUNTIES = [
  'Bastrop County',
  'Blanco County',
  'Burnet County',
  'Caldwell County',
  'Comal County',
  'Fayette County',
  'Hays County',
  'Lee County',
  'Llano County',
  'Milam County',
  'Travis County',
  'Williamson County',
];

// Default closing date = 30 days out, ISO date string for <input type="date">
function defaultClosingDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export default function SellerNetSheetClient() {
  // Transaction info
  const [agentName, setAgentName] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [closingCounty, setClosingCounty] = useState('Travis County');

  const [salePrice, setSalePrice] = useState(450000);
  const [payoff, setPayoff] = useState(280000);
  const [commissionRate, setCommissionRate] = useState(6);
  const [annualTax, setAnnualTax] = useState(8100);
  const [closingDate, setClosingDate] = useState<string>(defaultClosingDate());

  // Texas closing line items
  const defaultTitle = estimateTxTitlePolicy(salePrice);
  const [titlePolicy, setTitlePolicy] = useState(defaultTitle);
  const [titleAuto, setTitleAuto] = useState(true);
  const [escrowFee, setEscrowFee] = useState(425);
  const [recordingFees, setRecordingFees] = useState(150);
  const [docPrep, setDocPrep] = useState(250);
  const [survey, setSurvey] = useState(0);
  const [hoaTransfer, setHoaTransfer] = useState(0);
  const [homeWarranty, setHomeWarranty] = useState(0);
  const [concessions, setConcessions] = useState(0);
  const [misc, setMisc] = useState(0);

  // When the user toggles auto-title back on, recompute. When sale price
  // changes and auto is on, also recompute.
  const effectiveTitle = useMemo(() => {
    if (titleAuto) return estimateTxTitlePolicy(salePrice);
    return titlePolicy;
  }, [titleAuto, salePrice, titlePolicy]);

  const closingDoy = useMemo(() => dayOfYear(closingDate), [closingDate]);

  const result: NetSheetBreakdown = useMemo(
    () =>
      computeNetSheet({
        salePrice,
        mortgagePayoff: payoff,
        commissionRatePct: commissionRate,
        annualPropertyTax: annualTax,
        closingDayOfYear: closingDoy,
        titlePolicy: effectiveTitle,
        escrowFee,
        recordingFees,
        docPrep,
        survey,
        hoaTransferFee: hoaTransfer,
        homeWarranty,
        sellerConcessions: concessions,
        misc,
      }),
    [
      salePrice,
      payoff,
      commissionRate,
      annualTax,
      closingDoy,
      effectiveTitle,
      escrowFee,
      recordingFees,
      docPrep,
      survey,
      hoaTransfer,
      homeWarranty,
      concessions,
      misc,
    ]
  );

  const buildReport = (): CalcReport => ({
    title: 'Seller Net Sheet',
    subtitle:
      propertyAddress.trim().length > 0
        ? `${propertyAddress.trim()} · ${closingCounty}`
        : `${fmtUSD(salePrice)} sale price · ${commissionRate}% commission · closing ${closingDate}`,
    heroLabel: 'Estimated net to seller',
    heroValue: fmtUSD(result.netToSeller),
    meta: [
      { key: 'Generated', value: reportTimestamp() },
      ...(sellerName.trim() ? [{ key: 'Seller', value: sellerName.trim() }] : []),
      ...(agentName.trim() ? [{ key: 'Prepared by', value: agentName.trim() }] : []),
      { key: 'Closing county', value: closingCounty },
      { key: 'Closing date', value: closingDate },
      { key: 'Sale price', value: fmtUSD(salePrice) },
      { key: 'Mortgage payoff', value: fmtUSD(payoff) },
    ],
    sections: [
      {
        heading: 'Sale',
        rows: [
          { label: 'Sale price', value: fmtUSD(result.salePrice), emphasis: true },
        ],
      },
      {
        heading: 'Closing costs',
        rows: [
          { label: `Commission (${commissionRate}%)`, value: `−${fmtUSD(result.commission)}`, negative: true },
          { label: 'Title policy', value: `−${fmtUSD(result.titlePolicy)}`, negative: true },
          { label: 'Escrow / closing fee', value: `−${fmtUSD(result.escrowFee)}`, negative: true },
          { label: 'Recording', value: `−${fmtUSD(result.recordingFees)}`, negative: true },
          { label: 'Doc prep', value: `−${fmtUSD(result.docPrep)}`, negative: true },
          ...(result.survey > 0 ? [{ label: 'Survey', value: `−${fmtUSD(result.survey)}`, negative: true }] : []),
          ...(result.hoaTransferFee > 0 ? [{ label: 'HOA transfer', value: `−${fmtUSD(result.hoaTransferFee)}`, negative: true }] : []),
          ...(result.homeWarranty > 0 ? [{ label: 'Home warranty', value: `−${fmtUSD(result.homeWarranty)}`, negative: true }] : []),
          { label: 'Tax proration', value: `−${fmtUSD(result.taxProration)}`, negative: true },
          ...(result.sellerConcessions > 0 ? [{ label: 'Seller concessions', value: `−${fmtUSD(result.sellerConcessions)}`, negative: true }] : []),
          ...(result.misc > 0 ? [{ label: 'Misc', value: `−${fmtUSD(result.misc)}`, negative: true }] : []),
          { label: 'Total closing costs', value: `−${fmtUSD(result.totalClosingCosts)}`, emphasis: true, negative: true },
        ],
      },
      {
        heading: 'Payoff & net',
        rows: [
          { label: 'Mortgage payoff', value: `−${fmtUSD(result.mortgagePayoff)}`, negative: true },
          { label: 'Net to seller', value: fmtUSD(result.netToSeller), emphasis: true, negative: result.netToSeller < 0 },
        ],
      },
    ],
    disclaimer:
      'Estimates only. Actual closing figures vary by title company, lender payoff timing, and final negotiated terms. Not a guarantee of net proceeds — confirm with the title company\u2019s preliminary settlement statement before closing.',
    filename: `seller-net-sheet-${closingDate}`,
  });

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 md:py-16 pb-44 print:pb-12">
      <header className="mb-10 print:mb-4">
        <p className={EYEBROW}>REALTOR® Tool</p>
        <PageTitle>Seller Net Sheet</PageTitle>
        <p className="text-base text-gray-700 font-light leading-relaxed max-w-3xl mt-4 print:hidden">
          Estimate what your seller walks away with at closing. Texas-standard
          line items (owner&apos;s title policy, escrow, recording, doc prep,
          tax proration). Print a clean copy for the listing appointment.
        </p>
      </header>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* ── Inputs (hidden on print) ───────────────────────────── */}
        <div className="lg:col-span-3 space-y-5 print:hidden">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className={EYEBROW}>Transaction info</p>
            <p className="text-xs text-gray-500 mb-4">
              Used to personalize the printed and downloaded net sheet.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField
                label="Your name"
                value={agentName}
                onChange={setAgentName}
                required
                placeholder="e.g. Jane Smith"
              />
              <TextField
                label="Seller's name"
                value={sellerName}
                onChange={setSellerName}
                required
                placeholder="e.g. John & Mary Doe"
              />
            </div>
            <div className="mt-4">
              <TextField
                label="Property address"
                value={propertyAddress}
                onChange={setPropertyAddress}
                required
                placeholder="e.g. 1234 Main St, Austin, TX 78701"
              />
            </div>
            <div className="mt-4">
              <SelectField
                label="Closing county"
                value={closingCounty}
                onChange={setClosingCounty}
                options={CLOSING_COUNTIES}
                hint="Counties within ~60 miles of downtown Austin (78701)."
              />
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
              label="Mortgage payoff"
              value={payoff}
              onChange={setPayoff}
              prefix="$"
              step={1000}
            />
            <NumberField
              label="Total commission rate"
              value={commissionRate}
              onChange={setCommissionRate}
              suffix="%"
              step={0.25}
              hint="Both sides combined"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Annual property tax"
              value={annualTax}
              onChange={setAnnualTax}
              prefix="$"
              step={100}
            />
            <DateField
              label="Estimated closing date"
              value={closingDate}
              onChange={setClosingDate}
              hint={`Day ${closingDoy} of 365 (proration basis)`}
            />
          </div>

          <hr className="border-gray-200" />
          <p className="text-sm font-medium text-gray-800">Closing line items</p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <NumberField
                label="Owner's title policy"
                value={effectiveTitle}
                onChange={(n) => {
                  setTitleAuto(false);
                  setTitlePolicy(n);
                }}
                prefix="$"
                step={25}
                hint={
                  titleAuto
                    ? 'Auto — TX promulgated rate'
                    : 'Manual override'
                }
              />
              {!titleAuto && (
                <button
                  type="button"
                  onClick={() => setTitleAuto(true)}
                  className="text-xs text-[#1a2a44] underline underline-offset-2 mt-1"
                >
                  Reset to auto
                </button>
              )}
            </div>
            <NumberField
              label="Escrow / closing fee"
              value={escrowFee}
              onChange={setEscrowFee}
              prefix="$"
              step={25}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Recording fees"
              value={recordingFees}
              onChange={setRecordingFees}
              prefix="$"
              step={10}
            />
            <NumberField
              label="Doc prep"
              value={docPrep}
              onChange={setDocPrep}
              prefix="$"
              step={25}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <NumberField
              label="Survey"
              value={survey}
              onChange={setSurvey}
              prefix="$"
              step={50}
            />
            <NumberField
              label="HOA transfer"
              value={hoaTransfer}
              onChange={setHoaTransfer}
              prefix="$"
              step={25}
            />
            <NumberField
              label="Home warranty"
              value={homeWarranty}
              onChange={setHomeWarranty}
              prefix="$"
              step={25}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <NumberField
              label="Seller concessions"
              value={concessions}
              onChange={setConcessions}
              prefix="$"
              step={500}
              hint="Closing-cost credit to buyer"
            />
            <NumberField
              label="Misc / other"
              value={misc}
              onChange={setMisc}
              prefix="$"
              step={100}
            />
          </div>
        </div>

        {/* ── Net sheet card (also the print view) ───────────────── */}
        <div className="lg:col-span-2 print:col-span-5">
          <div className="lg:sticky lg:top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
            {(sellerName.trim() || propertyAddress.trim() || agentName.trim()) && (
              <div className="mb-5 pb-4 border-b border-gray-100 text-xs text-gray-600 space-y-0.5">
                {sellerName.trim() && (
                  <p>
                    <span className="uppercase tracking-[0.15em] text-gray-400 mr-1">
                      Seller:
                    </span>
                    <span className="font-medium text-gray-800">{sellerName.trim()}</span>
                  </p>
                )}
                {propertyAddress.trim() && (
                  <p>
                    <span className="uppercase tracking-[0.15em] text-gray-400 mr-1">
                      Property:
                    </span>
                    <span className="font-medium text-gray-800">{propertyAddress.trim()}</span>
                  </p>
                )}
                <p>
                  <span className="uppercase tracking-[0.15em] text-gray-400 mr-1">
                    Closing:
                  </span>
                  <span className="font-medium text-gray-800">
                    {closingCounty} · {closingDate}
                  </span>
                </p>
                {agentName.trim() && (
                  <p>
                    <span className="uppercase tracking-[0.15em] text-gray-400 mr-1">
                      Prepared by:
                    </span>
                    <span className="font-medium text-gray-800">{agentName.trim()}</span>
                  </p>
                )}
              </div>
            )}
            <p className={EYEBROW}>Estimated Net to Seller</p>
            <p
              className={`text-4xl mb-1 ${
                result.netToSeller >= 0 ? 'text-gray-900' : 'text-rose-700'
              }`}
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 500 }}
            >
              {fmtUSD(result.netToSeller)}
            </p>
            <p className="text-xs text-gray-500 mb-5">
              From {fmtUSD(salePrice)} sale price · closing {closingDate}
            </p>

            <dl className="space-y-2 text-sm">
              <Row label="Sale price" value={result.salePrice} bold />
              <SubRow label="Commission" value={-result.commission} />
              <SubRow label="Title policy" value={-result.titlePolicy} />
              <SubRow label="Escrow / closing fee" value={-result.escrowFee} />
              <SubRow label="Recording" value={-result.recordingFees} />
              <SubRow label="Doc prep" value={-result.docPrep} />
              {result.survey > 0 && <SubRow label="Survey" value={-result.survey} />}
              {result.hoaTransferFee > 0 && (
                <SubRow label="HOA transfer" value={-result.hoaTransferFee} />
              )}
              {result.homeWarranty > 0 && (
                <SubRow label="Home warranty" value={-result.homeWarranty} />
              )}
              <SubRow label="Tax proration" value={-result.taxProration} />
              {result.sellerConcessions > 0 && (
                <SubRow label="Seller concessions" value={-result.sellerConcessions} />
              )}
              {result.misc > 0 && <SubRow label="Misc" value={-result.misc} />}
              <hr className="border-gray-100 my-1" />
              <Row label="Total closing costs" value={-result.totalClosingCosts} muted />
              <Row label="Mortgage payoff" value={-result.mortgagePayoff} muted />
            </dl>

            <hr className="border-gray-200 my-4" />
            <div className="flex items-center justify-between text-base font-semibold text-gray-900">
              <span>Net to seller</span>
              <span className={result.netToSeller >= 0 ? '' : 'text-rose-700'}>
                {fmtUSD(result.netToSeller)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 mt-12 leading-relaxed print:hidden">
        Estimates only. Actual closing figures vary by title company, lender
        payoff timing, and final negotiated terms. Not a guarantee of net
        proceeds — confirm with the title company&apos;s preliminary settlement
        statement before closing.
      </p>

      <ResourceFloater
        shareTitle="Seller Net Sheet — RealtyLine Austin"
        shareText="Texas-standard seller net sheet — printable for listing appointments."
        buildReport={buildReport}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  muted = false,
  bold = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
  bold?: boolean;
}) {
  const isNeg = value < 0;
  return (
    <div
      className={`flex items-center justify-between ${
        muted ? 'text-gray-500' : 'text-gray-800'
      } ${bold ? 'font-semibold text-gray-900' : ''}`}
    >
      <span>{label}</span>
      <span
        className={`${bold ? 'text-gray-900' : 'font-medium'} ${
          isNeg ? 'text-rose-700' : ''
        }`}
      >
        {isNeg ? '−' : ''}
        {fmtUSD(Math.abs(value))}
      </span>
    </div>
  );
}

function SubRow({ label, value }: { label: string; value: number }) {
  const isNeg = value < 0;
  return (
    <div className="flex items-center justify-between text-sm text-gray-700 pl-3">
      <span>{label}</span>
      <span className={`font-medium ${isNeg ? 'text-rose-700' : 'text-gray-900'}`}>
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
          value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
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

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  const empty = required && value.trim().length === 0;
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">
        {label}
        {required && <span className="text-rose-600 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={required}
        aria-invalid={empty}
        className={`w-full rounded-md border px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 ${
          empty
            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/30'
            : 'border-gray-300 focus:border-[#1a2a44] focus:ring-[#1a2a44]/30'
        }`}
      />
      {empty ? (
        <span className="block text-xs text-rose-600 mt-1">Required</span>
      ) : (
        hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[#1a2a44] focus:outline-none focus:ring-1 focus:ring-[#1a2a44]/30"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

function DateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-800 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-[#1a2a44] focus:outline-none focus:ring-1 focus:ring-[#1a2a44]/30"
      />
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}
