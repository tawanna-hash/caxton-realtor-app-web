'use client';

// app/admin/billing/sign/[token]/SignWizard.tsx
//
// 5-step public sign wizard for the Advertising Agreement.
// Step 1: Welcome
// Step 2: Advertiser Information (fully editable)
// Step 3: Insertion Order (fully editable)
// Step 4: Billing & Payment (fully editable)
// Step 5: Terms & Sign

import { useRef, useState } from 'react';
import StripePaymentBlock, { type StripePaymentHandle } from './StripePaymentBlock';
import SignaturePad, { type SignatureValue } from './SignaturePad';
import { useRouter } from 'next/navigation';
import type { Agreement } from '@/lib/agreements';
import { termsForChannel } from '@/lib/agreement-terms';
import { cleanRepNote } from '@/lib/agreement-notes';
import { deriveChannelFromAgreementType } from '@/lib/ad-channels';
import {
  AD_SIZES,
  FREQUENCIES,
  MONTHS_LIST,
  PAYMENT_TYPES,
  BILL_TO,
} from '@/lib/pressbook-constants';
import {
  lookupRate,
  applyCcSurcharge,
  pagePositionPremium,
  computeTotal,
  computeExp,
} from '@/lib/agreement-pricing';
import { formatPhone, formatPhoneInput } from '@/lib/format-phone';

// Admin palette purple — matches /admin dashboards and CRM.
const ACCENT = '#5a0e5f';

// Format a line-item run window compactly. Accepts ISO YYYY-MM-DD strings.
// For print → uses month-and-year granularity ("Aug 2026 – Oct 2026").
// For email/app → uses day-level ("Jul 20 – Aug 3, 2026").
function formatLineWindow(channel: 'print' | 'email' | 'app', start: string | null, end: string | null): string {
  if (!start || !end) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some((n) => Number.isNaN(n))) return `${start} – ${end}`;
  const monShort = (m: number) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] ?? '';
  if (channel === 'print') {
    if (sy === ey && sm === em) return `${monShort(sm)} ${sy}`;
    if (sy === ey) return `${monShort(sm)} – ${monShort(em)} ${sy}`;
    return `${monShort(sm)} ${sy} – ${monShort(em)} ${ey}`;
  }
  if (sy === ey && sm === em && sd === ed) return `${monShort(sm)} ${sd}, ${sy}`;
  if (sy === ey) return `${monShort(sm)} ${sd} – ${monShort(em)} ${ed}, ${sy}`;
  return `${monShort(sm)} ${sd}, ${sy} – ${monShort(em)} ${ed}, ${ey}`;
}

// Mirror of quote-drafter computeTermFrom app branch: end = start + run length.
// weekly (default) → start + weeks*7 - 1 days; monthly → last day of (start month + months).
// Keeps the run window consistent when the advertiser picks a new start date.
function computeAppEnd(startIso: string, li: { frequency?: string | null; quantity?: number | null }): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startIso);
  if (!m) return startIso;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const freq = (li.frequency ?? '').trim();
  const qty = Math.max(1, li.quantity ?? 1);
  if (/mo$/i.test(freq)) {
    // day 0 of (start month + qty) = last day of the month before it
    const end = new Date(Date.UTC(y, mo - 1 + qty, 0));
    return end.toISOString().slice(0, 10);
  }
  const end = new Date(Date.UTC(y, mo - 1, d));
  end.setUTCDate(end.getUTCDate() + qty * 7 - 1);
  return end.toISOString().slice(0, 10);
}

const CURRENT_YEAR = new Date().getFullYear().toString();

// ── Helpers ──────────────────────────────────────────────────────────────────

function toISODateString(v: string | Date | null | undefined): string {
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function humanDate(iso: string | Date | null | undefined): string {
  const s = toISODateString(iso);
  if (!s) return '—';
  try {
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return s;
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function centsToStr(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function strToCents(s: string): number | null {
  const n = parseFloat(s);
  if (isNaN(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ── StepIndicator ─────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i + 1 < current
                ? 'text-white'
                : i + 1 === current
                  ? 'text-white'
                  : 'bg-gray-200 text-gray-500'
            }`}
            style={i + 1 <= current ? { background: ACCENT } : undefined}
          >
            {i + 1 < current ? '✓' : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-0.5 w-8 ${i + 1 < current ? '' : 'bg-gray-200'}`}
              style={i + 1 < current ? { background: ACCENT } : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Layout shell ─────────────────────────────────────────────────────────────

function Shell({
  children,
  step,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  saving,
}: {
  children: React.ReactNode;
  step: number;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div
            className="inline-block px-4 py-1 rounded-md text-white text-xs font-bold tracking-[0.2em] uppercase mb-3"
            style={{ background: ACCENT }}
          >
            RealtyLine
          </div>
          <h1 className="text-2xl text-gray-900">
            Advertising Agreement
          </h1>
          <p className="text-sm text-gray-500 mt-1">Secure digital signing powered by RealtyLine</p>
        </div>

        <StepIndicator current={step} total={5} />

        <div className="bg-white rounded-md border border-gray-200 shadow-sm p-8">
          {children}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          {onBack ? (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          {onNext && (
            <button
              onClick={onNext}
              disabled={nextDisabled || saving}
              style={{ background: nextDisabled || saving ? undefined : ACCENT }}
              className={`px-6 py-2 rounded-md text-white text-sm font-medium transition-opacity ${
                nextDisabled || saving ? 'bg-gray-300 cursor-not-allowed' : 'hover:opacity-90'
              }`}
            >
              {saving ? 'Saving…' : (nextLabel ?? 'Continue →')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Field helpers ─────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
      {children}
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  required,
  type,
  placeholder,
  readOnly,
  maxLength,
  inputMode,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  maxLength?: number;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className="block">
      <div className="text-xs text-gray-600 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={maxLength}
        inputMode={inputMode}
        className={`w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 ${
          readOnly ? 'bg-gray-100 text-gray-600 cursor-default' : ''
        }`}
      />
    </label>
  );
}

// ── Timing row type ────────────────────────────────────────────────────────────

type TimingRow = { checked: boolean; year: string };
type TimingState = Record<string, TimingRow>;

function initTiming(ag: Agreement): TimingState {
  const state: TimingState = {};
  for (const m of MONTHS_LIST) {
    const existingYear = ag.ad_timing_months?.[m.k];
    state[m.k] = {
      checked: !!existingYear,
      year: existingYear ?? CURRENT_YEAR,
    };
  }
  return state;
}

// ── Main SignWizard ───────────────────────────────────────────────────────────

// ── QuoteSummaryCard ──────────────────────────────────────────────────────────
// Read-only Insertion Order card for non-print channels. Everything below
// comes pre-populated from an approved quote (agreement row stamped by the
// server-side drafter), so we just render — no inputs.

function QuoteSummaryCard({
  ag,
  channel,
  overrideStart,
  overrideEnd,
}: {
  ag: Agreement;
  channel: 'digital' | 'email' | 'app';
  overrideStart?: string | null;
  overrideEnd?: string | null;
}) {
  const channelLabel =
    channel === 'digital' ? 'Digital placement' :
    channel === 'email' ? 'e-Blast' :
    'App placement';

  const startDate = shortDate(overrideStart ?? ag.start_date) ?? '—';
  const endDate = shortDate(overrideEnd ?? ag.end_date) ?? '—';
  const amount = ag.amount_cents != null
    ? `$${(ag.amount_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';
  const rate = ag.ad_rate_cents != null
    ? `$${(ag.ad_rate_cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : null;

  // ad_size holds the slot label ("Feed banner — premium", "Solo e-Blast", etc.)
  // frequency holds cadence ("3×", "4wk", "3mo", etc.)
  const slot = ag.ad_size?.trim() || '—';
  const cadence = ag.frequency?.trim() || null;

  return (
    <div className="rounded-md border border-purple-200 bg-purple-50/40">
      <div className="px-4 py-2 border-b border-purple-200 bg-purple-50 rounded-t-md">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-900">
          {channelLabel}
        </span>
      </div>
      <dl className="divide-y divide-purple-100 text-sm">
        <SummaryRow label="Placement" value={slot} />
        {cadence && <SummaryRow label="Cadence" value={cadence} />}
        <SummaryRow label="Start date" value={startDate} />
        <SummaryRow label="End date" value={endDate} />
        {rate && <SummaryRow label="Rate" value={rate} />}
        <SummaryRow
          label="Total"
          value={<span className="font-semibold text-gray-900">{amount}</span>}
        />
        {(() => {
          const note = cleanRepNote(ag.notes);
          return note ? (
            <SummaryRow
              label="Notes from rep"
              value={<span className="whitespace-pre-wrap">{note}</span>}
            />
          ) : null;
        })()}
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2">
      <dt className="text-xs uppercase tracking-wider text-gray-500 pt-0.5 flex-shrink-0 w-28">
        {label}
      </dt>
      <dd className="text-sm text-gray-800 text-right flex-1">{value}</dd>
    </div>
  );
}

function shortDate(d: string | Date | null | undefined): string | null {
  if (d == null) return null;
  // pg driver returns DATE columns as Date objects; coerce to ISO first so
  // the rest of the code sees a plain string. Never let a Date leak past
  // this point — a raw Date in JSX explodes with React error #31.
  let iso: string;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    // Use UTC components to stay stable across SSR/CSR timezones.
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    iso = `${y}-${m}-${day}`;
  } else if (typeof d === 'string') {
    iso = d.length >= 10 ? d.slice(0, 10) : d;
  } else {
    return null;
  }
  // Parse the ISO parts by hand — Date.toLocaleDateString differs between
  // Node ICU and browser ICU, causing hydration mismatches (React #418).
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const mon = Number(m[2]);
  const day = Number(m[3]);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (mon < 1 || mon > 12) return iso;
  return `${MONTHS[mon - 1]} ${day}, ${year}`;
}

// Coerce a pg DATE (Date object) or ISO string into 'YYYY-MM-DD', or '' if empty.
function isoDate(d: string | Date | null | undefined): string {
  if (d == null) return '';
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return d.length >= 10 ? d.slice(0, 10) : d;
}

// Leading-digit count from a cadence string ("4wk"→4, "3mo"→3, "1x"→1).
function parseAppQty(freq: string | null | undefined): number {
  if (!freq) return 1;
  const m = /^\s*(\d+)/.exec(freq);
  return m ? Number(m[1]) : 1;
}


type SignWizardLineItem = {
  id: string;
  line_no: number;
  channel: 'print' | 'email' | 'app';
  package_id: string;
  package_label: string;
  ad_size: string | null;
  frequency: string | null;
  quantity: number;
  unit_cents: number;
  amount_cents: number;
  publication: string | null;
  start_date: string | null;
  end_date: string | null;
  pay_now: boolean;
  meta: Record<string, unknown>;
};

export default function SignWizard({
  ag,
  token,
  lineItems = [],
}: {
  ag: Agreement;
  token: string;
  lineItems?: SignWizardLineItem[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Channel drives Step 3 layout + Step 5 terms language. For bundled
  // quotes (multiple line items) derive from the lines so a mixed / non-print
  // bundle (e.g. app Top Banner + e-Blast) isn't misread as print just because
  // the parent agreement type is 'package' (which deriveChannelFromAgreementType
  // maps to print). Single-line / legacy agreements fall back to the type column.
  const channel =
    lineItems.length > 0
      ? lineItems.every((li) => li.channel === 'print')
        ? 'print'
        : (lineItems.find((li) => li.channel !== 'print')?.channel ?? 'digital')
      : deriveChannelFromAgreementType(ag.type);
  const stripeRef = useRef<StripePaymentHandle>(null);
  // PaymentIntent id captured at end of Step 4 (while StripePaymentBlock is
  // still mounted). Step 5 just persists this — it no longer touches Stripe.
  const [confirmedPaymentIntentId, setConfirmedPaymentIntentId] = useState<string | null>(null);
  // True once Stripe Elements has fully mounted and is ready to confirm.
  // Gated by StripePaymentBlock's onReadyChange callback so the Authorize
  // button stays disabled until the form can actually accept a confirmation.
  const [stripeReady, setStripeReady] = useState(false);

  // ── Advertiser fields ──────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState(ag.company_name ?? '');
  const [repName, setRepName] = useState(ag.rep_name ?? '');
  const [advertiserEmail, setAdvertiserEmail] = useState(ag.advertiser_email ?? '');
  const [advertiserPhone, setAdvertiserPhone] = useState(formatPhone(ag.advertiser_phone ?? ''));
  const [address, setAddress] = useState(ag.address ?? '');
  const [city, setCity] = useState(ag.city ?? '');
  const [stateVal, setStateVal] = useState(ag.state ?? '');
  const [zip, setZip] = useState(ag.zip ?? '');

  // ── Insertion order ────────────────────────────────────────────────────────
  const [adSize, setAdSize] = useState(ag.ad_size ?? '');
  const [frequency, setFrequency] = useState(ag.frequency ?? '');
  const [adRate, setAdRate] = useState(centsToStr(ag.ad_rate_cents));
  const [rateUserEdited, setRateUserEdited] = useState(false);
  const [discount, setDiscount] = useState(centsToStr(ag.discount_cents));
  const [adPremium, setAdPremium] = useState(centsToStr(ag.ad_premium_cents));
  const [pagePosition, setPagePosition] = useState(ag.page_position ?? '');
  const [applyPagePremium, setApplyPagePremium] = useState(false);
  const [timing, setTiming] = useState<TimingState>(() => initTiming(ag));
  // ── Markets (proposal stage) ──────────────────────────────────────────────
  // Austin + San Antonio are launched; Houston / Dallas are not (gated).
  const [markets, setMarkets] = useState<Set<'austin' | 'san_antonio'>>(() => {
    const s = new Set<'austin' | 'san_antonio'>();
    if (ag.publication === 'austin' || ag.publication === 'both') s.add('austin');
    if (ag.publication === 'san_antonio' || ag.publication === 'both') s.add('san_antonio');
    return s;
  });

  // ── Placement date (Step 3 non-print) ───────────────────────────────────────
  // Advertiser can change the placement start date. App lines → end recomputed
  // from run length; email lines → start=end (single send). Print is untouched.
  const isSingleLine = lineItems.length === 0;
  const isNonPrint = channel !== 'print';
  const editableLineItems = lineItems.filter((li) => li.channel === 'app' || li.channel === 'email');
  const hasDateEditableLines = editableLineItems.length > 0;
  // Per-line placement start dates (bundle case). Each app / e-Blast line gets
  // its own picker — an app run and an e-Blast send may start on different days.
  const [lineStarts, setLineStarts] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const li of editableLineItems) m[li.line_no] = li.start_date ?? '';
    return m;
  });
  const setLineStart = (lineNo: number, v: string) =>
    setLineStarts((prev) => ({ ...prev, [lineNo]: v }));
  // Single-line (non-bundle) agreement: one placement start on the agreement row.
  const [placementStart, setPlacementStart] = useState<string>(
    isSingleLine && isNonPrint ? isoDate(ag.start_date) : '',
  );
  // Resolved line items: app/email lines adopt their per-line start; print unchanged.
  const displayLines = lineItems.map((li) => {
    const start = lineStarts[li.line_no];
    if (!start) return li;
    if (li.channel === 'email') return { ...li, start_date: start, end_date: start };
    if (li.channel === 'app') return { ...li, start_date: start, end_date: computeAppEnd(start, li) };
    return li;
  });
  // Patches sent to the server for app/email bundle lines (Step 3).
  const lineItemDatePatches = displayLines
    .filter((li) => (li.channel === 'app' || li.channel === 'email') && li.start_date && li.end_date)
    .map((li) => ({ line_no: li.line_no, start_date: li.start_date, end_date: li.end_date }));
  // Single-line agreement resolved window. Restricted to email + app (digital
  // cadence isn't guaranteed to be 4wk/3mo-style, so skip it for now).
  const singleLineEditable = isSingleLine && isNonPrint && (channel === 'email' || channel === 'app');
  const singleLineStart = singleLineEditable && placementStart ? placementStart : null;
  const singleLineEnd =
    singleLineEditable && placementStart
      ? channel === 'email'
        ? placementStart
        : computeAppEnd(placementStart, { frequency: ag.frequency, quantity: parseAppQty(ag.frequency) })
      : null;
  // Whether the advertiser can change placement dates on this Step 3 view.
  const canEditPlacementDate = hasDateEditableLines || singleLineEditable;

  // ── Billing ────────────────────────────────────────────────────────────────
  const [billTo, setBillTo] = useState<string>(ag.bill_to ?? 'Advertiser');
  const [billingEmail, setBillingEmail] = useState(ag.billing_email ?? '');
  const [billingContactName, setBillingContactName] = useState(ag.billing_contact_name ?? '');
  const [billingContactPhone, setBillingContactPhone] = useState(formatPhone(ag.billing_contact_phone ?? ''));
  // Digital/e-Blast/App require prepayment by credit card before placement;
  // Check is only offered for print agreements.
  const checkDisabled = channel !== 'print';
  const [paymentType, setPaymentType] = useState<string>(
    checkDisabled
      ? 'Credit Card'
      : (ag.card_type || ag.payment_mode === 'card'
          ? 'Credit Card'
          : (ag.payment_mode === 'check' ? 'Check' : '')),
  );

  // ── Sign step ──────────────────────────────────────────────────────────────
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signature, setSignature] = useState<SignatureValue>({
    method: 'type',
    signerName: ag.rep_name ?? '',
  });
  const signerName = signature.signerName;
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));
  const [approving, setApproving] = useState(false);

  // ── Computed values ────────────────────────────────────────────────────────

  // Auto-fill rate lookup (derive inline, no useEffect)
  let effectiveAdRate = adRate;
  if (adSize && frequency && !rateUserEdited) {
    const lookup = lookupRate(frequency, adSize);
    if (lookup) effectiveAdRate = lookup.rate.toString();
  }

  // Auto-fill page premium (derive inline, no useEffect)
  let effectiveAdPremium = adPremium;
  if (applyPagePremium) {
    const base = parseFloat(effectiveAdRate) || 0;
    effectiveAdPremium = pagePositionPremium(base).toFixed(2);
  }
  const parsedRate = parseFloat(effectiveAdRate) || 0;
  const parsedDiscount = parseFloat(discount) || 0;
  const parsedPremium = parseFloat(effectiveAdPremium) || 0;
  const totalMonthly = computeTotal(parsedRate, parsedDiscount, parsedPremium);

  const timingChecked: Record<string, boolean> = {};
  const timingYears: Record<string, string> = {};
  for (const m of MONTHS_LIST) {
    timingChecked[m.k] = timing[m.k]?.checked ?? false;
    timingYears[m.k] = timing[m.k]?.year ?? CURRENT_YEAR;
  }
  const expDate = computeExp(timingChecked, timingYears, frequency, signDate);

  // Charge base:
  //   • Print: recurring monthly = ad_rate + premium − discount (existing totalMonthly).
  //   • Non-print (Digital/Email/App): one-time total from the quote (ag.amount_cents).
  //     Quote drafter stamps this as the full contract value; ad_rate_cents holds
  //     the per-unit rate which is NOT what Stripe should charge.
  const quotedTotalDollars =
    channel !== 'print' && ag.amount_cents != null && ag.amount_cents > 0
      ? ag.amount_cents / 100
      : totalMonthly;
  const chargeBaseCents = lineItems.length > 0
    ? lineItems.filter((li) => li.pay_now).reduce((acc, li) => acc + li.amount_cents, 0)
    : Math.round(quotedTotalDollars * 100);
  // Displayed total must match what Stripe actually charges (chargeBaseCents).
  // For a bundle that's the sum of pay_now line items — NOT ag.amount_cents,
  // which can be stale on a bundled agreement and would show the wrong total.
  const ccSurchargeTotal =
    paymentType === 'Credit Card' ? applyCcSurcharge(chargeBaseCents / 100) : null;
  const surchargeLabel = channel === 'print' ? 'New monthly' : 'New total';

  // ── saveEdits ──────────────────────────────────────────────────────────────

  function buildPatchPayload(): Record<string, unknown> {
    const timingObj: Record<string, string> = {};
    for (const m of MONTHS_LIST) {
      if (timing[m.k]?.checked) {
        timingObj[m.k] = timing[m.k]?.year ?? CURRENT_YEAR;
      }
    }
    return {
      company_name: companyName || null,
      rep_name: repName || null,
      advertiser_email: advertiserEmail || null,
      advertiser_phone: advertiserPhone || null,
      address: address || null,
      city: city || null,
      state: stateVal || null,
      zip: zip || null,
      ad_size: adSize || null,
      frequency: frequency || null,
      page_position: pagePosition || null,
      ad_rate_cents: strToCents(effectiveAdRate),
      discount_cents: strToCents(discount),
      ad_premium_cents: strToCents(effectiveAdPremium),
      total_monthly_rate_cents: strToCents(totalMonthly.toFixed(2)),
      ad_timing_months: Object.keys(timingObj).length > 0 ? timingObj : null,
      exp_date: expDate || null,
      bill_to: billTo || null,
      billing_email: billingEmail || null,
      billing_contact_name: billingContactName || null,
      billing_contact_phone: billingContactPhone || null,
      payment_mode: paymentType === 'Credit Card' ? 'card' : paymentType === 'Check' ? 'check' : null,
      // Advertiser-chosen placement dates for app bundle lines (Step 3).
      ...(lineItemDatePatches.length > 0 ? { line_item_dates: lineItemDatePatches } : {}),
      // Advertiser-chosen placement date for single-line (non-bundle) agreements.
      ...(singleLineStart && singleLineEnd ? { start_date: singleLineStart, end_date: singleLineEnd } : {}),
      // Card details (type, cardholder, last4, exp, address) are captured by
      // Stripe Elements + populated server-side from the PaymentIntent's
      // PaymentMethod when the webhook fires. Do not send placeholder values
      // from the wizard — Stripe is the source of truth.
    };
  }

  async function saveEdits(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildPatchPayload()),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleNext() {
    const ok = await saveEdits();
    if (!ok) return;
    // Special case: leaving Step 4 with Credit Card selected → authorize the
    // card NOW while StripePaymentBlock is still mounted. The actual capture
    // happens server-side via the payment_intent.succeeded webhook.
    if (step === 4 && paymentType === 'Credit Card') {
      setSaving(true);
      setError(null);
      try {
        if (!stripeRef.current) {
          setError('Card payment form is not ready. Reload the page and try again, or choose Check.');
          setSaving(false);
          return;
        }
        const result = await stripeRef.current.confirm();
        if ('skipped' in result) {
          setError('Card payment did not process. The secure payment form was not initialized. Reload the page and try again, or choose Check.');
          setSaving(false);
          return;
        }
        setConfirmedPaymentIntentId(result.paymentIntentId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'card authorization failed';
        setError(`Card payment failed: ${msg}. Update card details or choose Check.`);
        setSaving(false);
        return;
      } finally {
        setSaving(false);
      }
    }
    setStep((s) => s + 1);
  }

  // ── submitSignature ────────────────────────────────────────────────────────

  async function uploadSignatureBlob(
    blob: Blob,
    filename: string,
    kind: 'signature' | 'document',
  ): Promise<string> {
    const fd = new FormData();
    fd.append('file', blob, filename);
    fd.append('kind', kind);
    const res = await fetch(`/api/sign/${token}/upload`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const j = (await res.json()) as { error?: string; detail?: string };
        detail = j.error || j.detail || '';
      } catch { /* noop */ }
      throw new Error(detail || `upload failed (HTTP ${res.status})`);
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }

  async function submitSignature() {
    if (!termsAccepted || !signerName.trim()) return;

    // Method-specific guards.
    if (signature.method === 'draw' && !signature.pngBlob) {
      setError('Please draw your signature before continuing.');
      return;
    }
    if (signature.method === 'upload' && !signature.file) {
      setError('Please choose a signed file to upload before continuing.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // 1. Card authorization happened at the end of Step 4 (while the
      //    StripePaymentBlock was still mounted). If Credit Card was selected,
      //    we MUST have a confirmedPaymentIntentId here — hard-fail otherwise.
      let stripePaymentIntentId: string | null = null;
      if (paymentType === 'Credit Card') {
        if (!confirmedPaymentIntentId) {
          setError('Card was not authorized in the previous step. Go back to Billing & Payment and re-enter your card.');
          setSaving(false);
          return;
        }
        stripePaymentIntentId = confirmedPaymentIntentId;
      }

      // 2. For draw / upload methods, upload the asset to blob storage and
      //    capture the resulting URL.
      let signedDocumentUrl: string | null = null;
      if (signature.method === 'draw' && signature.pngBlob) {
        signedDocumentUrl = await uploadSignatureBlob(
          signature.pngBlob,
          `signature-${ag.id}.png`,
          'signature',
        );
      } else if (signature.method === 'upload' && signature.file) {
        signedDocumentUrl = await uploadSignatureBlob(
          signature.file,
          signature.file.name,
          'document',
        );
      }

      // 3. Persist signature + patches.
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signedAt: signDate,
          termsAccepted: true,
          signMethod: signature.method,
          signedDocumentUrl,
          patches: buildPatchPayload(),
          stripePaymentIntentId,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push(`/admin/billing/sign/${token}/done?id=${ag.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'signing failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Proposal stage (two-stage proposal->agreement flow) ───────────────────
  // proposal_approved: client already approved — show confirmation, await rep.
  // proposal_sent:     client reviews the proposal and approves (no signature).

  async function approveProposal() {
    setApproving(true);
    setError(null);
    try {
      // Persist the client's IO edits (ad size, frequency, position, timing,
      // markets) before flipping to proposal_approved.
      const patches = buildPatchPayload();
      const numMarkets = markets.size;
      if (channel === 'print' && numMarkets > 0) {
        patches.publication =
          numMarkets === 2 ? 'both' : (markets.has('austin') ? 'austin' : 'san_antonio');
        // Multi-market pricing: base monthly x number of selected markets.
        const baseCents = strToCents(totalMonthly.toFixed(2)) ?? 0;
        patches.total_monthly_rate_cents = Math.round(baseCents * numMarkets);
      }
      const patchRes = await fetch(`/api/sign/${token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patches),
      });
      if (!patchRes.ok) throw new Error(`Save failed (HTTP ${patchRes.status})`);
      const res = await fetch(`/api/sign/${token}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approverName: ag.rep_name || ag.advertiser_email || '' }),
      });
      if (!res.ok) {
        let detail = '';
        try { detail = ((await res.json()) as { error?: string; detail?: string }).error || ''; } catch { /* noop */ }
        throw new Error(detail || `Approve failed (HTTP ${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'approve failed');
    } finally {
      setApproving(false);
    }
  }

  if (ag.status === 'proposal_approved') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl text-center">
          <div className="inline-block px-4 py-1 rounded-md text-white text-xs font-bold tracking-[0.2em] uppercase mb-3" style={{ background: ACCENT }}>RealtyLine</div>
          <h1 className="text-2xl text-gray-900">Proposal received</h1>
          <p className="text-sm text-gray-500 mt-1">Thank you — your advertising proposal has been approved.</p>
          <div className="bg-white rounded-md border border-gray-200 shadow-sm p-8 mt-6 text-left">
            <p className="text-sm text-gray-700 leading-relaxed">
              We&apos;ve received your approval for <strong>{ag.company_name || 'your advertising proposal'}</strong>.
              Your representative will prepare the final advertising agreement and email it to you for signature.
              Nothing is binding until you sign the final agreement.
            </p>
            <p className="text-sm text-gray-500 mt-4">
              Questions? Reply to your proposal email or contact your representative.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (ag.status === 'proposal_sent') {
    const isPrint = channel === 'print';
    const numMarkets = markets.size;
    const baseMonthly = totalMonthly; // single-market: rate - discount + premium
    const indicativeTotal = isPrint
      ? baseMonthly * (numMarkets || 1)
      : (ag.amount_cents ? ag.amount_cents / 100 : baseMonthly);

    const marketList: Array<{ id: 'austin' | 'san_antonio' | 'hou' | 'dal'; label: string; live: boolean }> = [
      { id: 'austin', label: 'RealtyLine Austin', live: true },
      { id: 'san_antonio', label: 'Newsline San Antonio', live: true },
      { id: 'hou', label: 'RealtyLine Houston', live: false },
      { id: 'dal', label: 'RealtyLine Dallas/FTW', live: false },
    ];
    const toggleMarket = (id: 'austin' | 'san_antonio') => {
      setMarkets((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <div className="min-h-screen bg-white flex flex-col items-center py-8 px-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-6">
            <div className="inline-block px-4 py-1 rounded-md text-white text-xs font-bold tracking-[0.2em] uppercase mb-3" style={{ background: ACCENT }}>RealtyLine</div>
            <h1 className="text-2xl text-gray-900">Advertising Proposal</h1>
            <p className="text-sm text-gray-500 mt-1">Proposal — not yet an agreement. Adjust your insertion order and approve to continue.</p>
          </div>
          <div className="bg-white rounded-md border border-gray-200 shadow-sm p-8 space-y-5">
            {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

            {isPrint ? (
              <>
                <h2 className="text-lg text-gray-900">Insertion order</h2>

                <div>
                  <Eyebrow>Ad Size</Eyebrow>
                  <div className="flex flex-wrap gap-3">
                    {AD_SIZES.map((sz) => (
                      <label key={sz} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="pAdSize" value={sz} checked={adSize === sz} onChange={() => { setAdSize(sz); setRateUserEdited(false); }} className="accent-purple-600" />
                        <span className="text-sm text-gray-800">{sz}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Eyebrow>Frequency</Eyebrow>
                  <div className="flex flex-wrap gap-3">
                    {FREQUENCIES.map((f) => (
                      <label key={f} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="pFreq" value={f} checked={frequency === f} onChange={() => { setFrequency(f); setRateUserEdited(false); }} className="accent-purple-600" />
                        <span className="text-sm text-gray-800">{f}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Eyebrow>Page Position</Eyebrow>
                    <input type="text" value={pagePosition} onChange={(e) => setPagePosition(e.target.value)} placeholder="e.g. Inside front cover" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={applyPagePremium} onChange={(e) => setApplyPagePremium(e.target.checked)} className="w-4 h-4 accent-purple-600" />
                    <span className="text-sm text-gray-700">Apply 20% Premium</span>
                  </label>
                </div>

                <div>
                  <Eyebrow>Markets</Eyebrow>
                  <div className="grid grid-cols-2 gap-2">
                    {marketList.map((m) => {
                      const checked =
                        m.id === 'austin' ? markets.has('austin')
                        : m.id === 'san_antonio' ? markets.has('san_antonio')
                        : false;
                      return (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2 border rounded-md px-3 py-2 text-sm ${m.live ? 'cursor-pointer border-gray-300' : 'opacity-50 cursor-not-allowed bg-gray-100 border-gray-200'} ${checked ? 'bg-[#faf5fb] border-[#5a0e5f]' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!m.live}
                            onChange={() => { if (m.live) toggleMarket(m.id as 'austin' | 'san_antonio'); }}
                            className="accent-purple-600"
                          />
                          <span>{m.label}</span>
                          {!m.live && <span className="ml-auto text-[9px] uppercase tracking-wider text-gray-400 font-semibold">Coming soon</span>}
                        </label>
                      );
                    })}
                  </div>
                  {numMarkets === 0 && <p className="text-xs text-amber-700 mt-1">Pick at least one market.</p>}
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg text-gray-900">Your quoted placement</h2>
                <p className="text-sm text-gray-600">The details below were prepared by your sales rep. Approve to convert this proposal into your advertising agreement.</p>
                {lineItems.length > 0 ? (
                  <ul className="space-y-2">
                    {displayLines.map((li) => (
                      <li key={li.id} className="flex items-start justify-between border-b border-gray-100 pb-2 last:border-b-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900">{li.package_label}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{li.start_date && li.end_date ? `${humanDate(li.start_date)} – ${humanDate(li.end_date)}` : ''}</div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900 ml-3 whitespace-nowrap">${(li.amount_cents / 100).toFixed(2)}</div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-4"><dt className="text-gray-500">Ad size</dt><dd className="text-gray-900 font-medium">{ag.ad_size || '—'}</dd></div>
                    <div className="flex justify-between gap-4"><dt className="text-gray-500">Frequency</dt><dd className="text-gray-900 font-medium">{ag.frequency || '—'}</dd></div>
                  </dl>
                )}
              </>
            )}

            <div className="rounded-md border border-purple-200 bg-purple-50/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-purple-900">Indicative total</div>
                <div className="text-xl font-bold text-purple-900">${indicativeTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="text-xs text-purple-800/70 mt-1">
                {isPrint
                  ? `${adSize || '—'} · ${frequency || '—'}${numMarkets > 1 ? ` · ${numMarkets} markets` : ''} · expires ${expDate || '—'}`
                  : 'Final price is confirmed in the agreement.'}
              </div>
            </div>

            <div className="rounded-md bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-700">Billing terms (fixed):</span> Net monthly invoice · Credit card / ACH / check to Caxton Publications, Inc.
              Approving sends this proposal to your representative, who will email the final agreement for your signature.
            </div>

            <div className="flex justify-end">
              <button
                onClick={approveProposal}
                disabled={approving || (isPrint && numMarkets === 0)}
                style={{ background: ACCENT }}
                className="px-6 py-2 rounded-md text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {approving ? 'Submitting…' : 'Approve Proposal'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step 1: Welcome ─────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <Shell step={1} onNext={() => setStep(2)}>
        <div className="text-center space-y-4">
          <div className="text-5xl">📋</div>
          <h2 className="text-xl text-gray-900">
            Welcome, {ag.rep_name ?? 'Advertiser'}
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            You&apos;re about to sign an <strong>Advertising Agreement</strong> with{' '}
            <strong>RealtyLine</strong> for{' '}
            <strong>{ag.company_name ?? 'your company'}</strong>.
          </p>
          <div className="inline-block rounded-md border-l-4 p-4 text-left text-sm text-gray-700 bg-amber-50 border-amber-400 max-w-md">
            <p className="font-semibold mb-1">⚠️ Legal Notice</p>
            <p>
              This is a legally binding digital signature. By completing this process, you agree to
              the terms and conditions of the advertising agreement.
            </p>
          </div>
          <p className="text-xs text-gray-400">This wizard takes approximately 2 minutes to complete.</p>
        </div>
      </Shell>
    );
  }

  // ─── Step 2: Advertiser Information ───────────────────────────────────────

  if (step === 2) {
    return (
      <Shell
        step={2}
        onBack={() => setStep(1)}
        onNext={handleNext}
        nextLabel="Next →"
        saving={saving}
      >
        <div className="space-y-4">
          <Eyebrow>Advertiser Information</Eyebrow>
          <h2 className="text-lg text-gray-900">
            Your advertiser details
          </h2>
          <p className="text-sm text-gray-600">
            Fill in or update your information below. Fields marked <span className="text-red-500">*</span> are required.
          </p>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditableField
              label="Company Name"
              required
              value={companyName}
              onChange={setCompanyName}
            />
            <EditableField
              label="Representative Name"
              required
              value={repName}
              onChange={setRepName}
            />
            <EditableField
              label="Email"
              required
              type="email"
              value={advertiserEmail}
              onChange={setAdvertiserEmail}
            />
            <EditableField
              label="Phone"
              type="tel"
              value={advertiserPhone}
              onChange={(v) => setAdvertiserPhone(formatPhoneInput(v))}
              placeholder="(000) 000-0000"
            />
            <EditableField
              label="Address"
              value={address}
              onChange={setAddress}
            />
            <EditableField
              label="City"
              value={city}
              onChange={setCity}
            />
            <EditableField
              label="State"
              value={stateVal}
              onChange={setStateVal}
            />
            <EditableField
              label="Zip"
              value={zip}
              onChange={setZip}
            />
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Step 3: Insertion Order ───────────────────────────────────────────────
  //
  // Print agreements: fully editable Insertion Order (ad size, frequency,
  // rate, page position, month-by-month timing). Digital / Email / App
  // agreements come pre-populated from an approved quote, so the advertiser
  // sees a read-only summary of what the rep quoted — no editable fields.

  if (step === 3 && channel !== 'print') {
    return (
      <Shell
        step={3}
        onBack={() => setStep(2)}
        onNext={handleNext}
        nextLabel="Next →"
        saving={saving}
      >
        <div className="space-y-5">
          <Eyebrow>Insertion Order</Eyebrow>
          <h2 className="text-lg text-gray-900">Your quoted placement</h2>
          <p className="text-sm text-gray-600">
            The details below were prepared by your sales rep from an approved quote.
            {canEditPlacementDate
              ? ' You can update placement dates below.'
              : ' If anything looks wrong, please contact us before signing.'}
          </p>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

          {lineItems.length > 0 ? (
            <div className="rounded-md border border-purple-200 bg-purple-50/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-purple-900 mb-3">
                Bundled quote · {lineItems.length} line items
              </div>

              {/* Placement start dates — one per app/e-Blast line (ends auto-compute). */}
              {hasDateEditableLines && (
                <div className="mb-3 pb-3 border-b border-purple-100 space-y-2">
                  {editableLineItems.map((li) => (
                    <div key={li.line_no}>
                      <label
                        htmlFor={`placementStart-${li.line_no}`}
                        className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1"
                      >
                        {li.package_label} — start date
                      </label>
                      <input
                        id={`placementStart-${li.line_no}`}
                        type="date"
                        value={lineStarts[li.line_no] ?? ''}
                        onChange={(e) => setLineStart(li.line_no, e.target.value)}
                        className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                  ))}
                </div>
              )}

              <ul className="space-y-2">
                {displayLines.map((li) => (
                  <li
                    key={li.id}
                    className="flex items-start justify-between border-b border-purple-100 pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900">{li.package_label}</div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {li.channel === 'print' && `${li.quantity} month${li.quantity > 1 ? 's' : ''}`}
                        {li.channel === 'email' && `${li.quantity} send${li.quantity > 1 ? 's' : ''}`}
                        {li.channel === 'app' && (li.frequency ?? '')}
                        {li.start_date && li.end_date && ` · ${formatLineWindow(li.channel, li.start_date, li.end_date)}`}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 ml-3 whitespace-nowrap">
                      ${(li.amount_cents / 100).toFixed(2)}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-purple-300">
                <div className="text-sm font-semibold text-gray-800">Grand total</div>
                <div className="text-base font-bold text-purple-900">
                  ${(lineItems.reduce((s, l) => s + l.amount_cents, 0) / 100).toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {singleLineEditable && (
                <div className="rounded-md border border-purple-200 bg-purple-50/40 p-4">
                  <label htmlFor="placementStartSingle" className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1">
                    Placement start date
                  </label>
                  <input
                    id="placementStartSingle"
                    type="date"
                    value={placementStart}
                    onChange={(e) => setPlacementStart(e.target.value)}
                    className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
              )}
              <QuoteSummaryCard ag={ag} channel={channel} overrideStart={singleLineStart} overrideEnd={singleLineEnd} />
            </div>
          )}
        </div>
      </Shell>
    );
  }

  if (step === 3) {
    const hasAnyMonth = MONTHS_LIST.some((m) => timing[m.k]?.checked);

    return (
      <Shell
        step={3}
        onBack={() => setStep(2)}
        onNext={handleNext}
        nextLabel="Next →"
        saving={saving}
      >
        <div className="space-y-5">
          <Eyebrow>Insertion Order</Eyebrow>
          <h2 className="text-lg text-gray-900">
            Your ad details
          </h2>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

          {/* Ad Size */}
          <div>
            <Eyebrow>Ad Size</Eyebrow>
            <div className="flex flex-wrap gap-3">
              {AD_SIZES.map((s) => (
                <label key={s} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="adSize"
                    value={s}
                    checked={adSize === s}
                    onChange={() => {
                      setAdSize(s);
                      setRateUserEdited(false);
                    }}
                    className="accent-purple-600"
                  />
                  <span className="text-sm text-gray-800">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Frequency */}
          <div>
            <Eyebrow>Frequency</Eyebrow>
            <div className="flex flex-wrap gap-3">
              {FREQUENCIES.map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    value={f}
                    checked={frequency === f}
                    onChange={() => {
                      setFrequency(f);
                      setRateUserEdited(false);
                    }}
                    className="accent-purple-600"
                  />
                  <span className="text-sm text-gray-800">{f}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Rate + Discount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditableField
              label="Ad Rate ($)"
              value={effectiveAdRate}
              onChange={(v) => {
                setAdRate(v);
                setRateUserEdited(true);
              }}
              inputMode="decimal"
            />
            <EditableField
              label="Discount ($)"
              value={discount}
              onChange={setDiscount}
              inputMode="decimal"
            />
          </div>

          {/* Premium + Total */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditableField
              label="Ad Premium ($)"
              value={effectiveAdPremium}
              onChange={(v) => {
                setAdPremium(v);
              }}
              inputMode="decimal"
            />
            <div>
              <div className="text-xs text-gray-600 mb-1">Total Monthly</div>
              <div className="w-full px-3 py-2 rounded-md border border-gray-200 bg-gray-100 text-sm font-bold text-gray-900">
                ${totalMonthly.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Page Position */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <EditableField
              label="Page Position"
              value={pagePosition}
              onChange={setPagePosition}
              placeholder="e.g. Inside front cover"
            />
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={applyPagePremium}
                onChange={(e) => setApplyPagePremium(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              <span className="text-sm text-gray-700">Apply 20% Premium</span>
            </label>
          </div>

          {/* Ad Timing */}
          <div>
            <Eyebrow>Ad Timing Term</Eyebrow>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-2">
              {MONTHS_LIST.map((m) => {
                const row = timing[m.k] ?? { checked: false, year: CURRENT_YEAR };
                return (
                  <div key={m.k} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`month-${m.k}`}
                      checked={row.checked}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setTiming((prev) => ({
                          ...prev,
                          [m.k]: {
                            checked,
                            year: prev[m.k]?.year ?? CURRENT_YEAR,
                          },
                        }));
                      }}
                      className="w-4 h-4 accent-purple-600 flex-shrink-0"
                    />
                    <label htmlFor={`month-${m.k}`} className="text-sm text-gray-700 w-20 flex-shrink-0 cursor-pointer">
                      {m.l}
                    </label>
                    <input
                      type="text"
                      value={row.year}
                      disabled={!row.checked}
                      maxLength={4}
                      inputMode="numeric"
                      onChange={(e) => {
                        const yr = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setTiming((prev) => ({
                          ...prev,
                          [m.k]: { ...prev[m.k]!, checked: prev[m.k]?.checked ?? false, year: yr },
                        }));
                      }}
                      className="w-16 px-2 py-1 rounded-md border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {hasAnyMonth
                ? `Agreement expires on ${humanDate(expDate)}`
                : 'Pick at least one month to set expiration'}
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // ─── Step 4: Billing & Payment ────────────────────────────────────────────

  if (step === 4) {
    const ccNotReady = paymentType === 'Credit Card' && !stripeReady;
    return (
      <Shell
        step={4}
        onBack={() => setStep(3)}
        onNext={handleNext}
        nextLabel={
          paymentType === 'Credit Card'
            ? (stripeReady ? 'Authorize Card →' : 'Loading payment form…')
            : 'Next →'
        }
        nextDisabled={ccNotReady}
        saving={saving}
      >
        <div className="space-y-5">
          <Eyebrow>Billing &amp; Payment</Eyebrow>
          <h2 className="text-lg text-gray-900">
            Billing information
          </h2>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

          {/* Bill To */}
          <div>
            <Eyebrow>Bill To</Eyebrow>
            <div className="flex gap-4">
              {BILL_TO.map((b) => (
                <label key={b} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="billTo"
                    value={b}
                    checked={billTo === b}
                    onChange={() => setBillTo(b)}
                    className="accent-purple-600"
                  />
                  <span className="text-sm text-gray-800">{b}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Billing Email */}
          <EditableField
            label="Billing Email"
            required
            type="email"
            value={billingEmail}
            onChange={setBillingEmail}
          />

          {/* Billing Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditableField
              label="Billing Contact Name"
              value={billingContactName}
              onChange={setBillingContactName}
            />
            <EditableField
              label="Billing Contact Phone"
              type="tel"
              value={billingContactPhone}
              onChange={(v) => setBillingContactPhone(formatPhoneInput(v))}
              placeholder="(000) 000-0000"
            />
          </div>

          {/* Payment Type */}
          <div>
            <Eyebrow>Payment Type</Eyebrow>
            <div className="flex gap-4">
              {PAYMENT_TYPES.map((p) => {
                const disabled = p === 'Check' && checkDisabled;
                return (
                  <label key={p} className={`flex items-center gap-2 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="radio"
                      name="paymentType"
                      value={p}
                      checked={paymentType === p}
                      onChange={() => setPaymentType(p)}
                      disabled={disabled}
                      className="accent-purple-600"
                    />
                    <span className="text-sm text-gray-800">{p}</span>
                  </label>
                );
              })}
            </div>
            {checkDisabled && (
              <p className="text-xs text-gray-500 mt-1">
                Prepayment by credit card is required for digital, e-Blast, and App ad placements before they go live. If paying by check is preferred, please contact Tawanna at{' '}
                <a href="mailto:tawanna@myrealtyline.com" className="text-[#5a0e5f] hover:underline">tawanna@myrealtyline.com</a>{' '}
                for consideration.
              </p>
            )}
          </div>

          {/* Credit Card — Stripe Elements only (no legacy reference fields).
              Stripe captures card type, cardholder, last 4, expiration, and
              billing address securely; server populates DB fields from the
              PaymentMethod when the webhook fires. */}
          {paymentType === 'Credit Card' && (
            <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50 p-4">
              {ccSurchargeTotal != null && (
                <div className="text-sm text-amber-800 rounded-md border border-amber-300 bg-amber-100 p-3">
                  A 3% credit card surcharge is automatically added to your ad rate.{' '}
                  <strong>{surchargeLabel}: ${ccSurchargeTotal.toFixed(2)}</strong>
                </div>
              )}

              <div className="rounded-md bg-white p-4 border border-amber-200">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                  Secure Card Payment
                </p>
                <StripePaymentBlock
                  ref={stripeRef}
                  token={token}
                  adRateCents={chargeBaseCents}
                  refreshKey={`${adSize}|${frequency}|${chargeBaseCents}`}
                  onReadyChange={setStripeReady}
                />
                <p className="text-[11px] text-gray-500 mt-2">
                  {channel === 'print' ? (
                    <>When you click <strong>Authorize Card</strong> below, your card is authorized and charged for the first issue. Your card is securely saved for future monthly issue charges. You’ll review and sign the terms on the next step.</>
                  ) : (
                    <>When you click <strong>Authorize Card</strong> below, your card is authorized and charged for the full quoted total. Your card is securely saved for any future renewals. You’ll review and sign the terms on the next step.</>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Step 5: Terms & Sign ─────────────────────────────────────────────────

  const hasSignatureAsset =
    signature.method === 'type'
      ? true
      : signature.method === 'draw'
        ? !!signature.pngBlob
        : !!signature.file;
  const canSign = termsAccepted && signerName.trim() !== '' && signDate !== '' && hasSignatureAsset;

  return (
    <Shell
      step={5}
      onBack={() => {
        // Going back to Step 4 invalidates any prior card authorization —
        // user must re-enter the card and re-confirm before reaching Step 5.
        setConfirmedPaymentIntentId(null);
        setStripeReady(false);
        setStep(4);
      }}
      onNext={submitSignature}
      nextLabel="Accept Proposal & Sign"
      nextDisabled={!canSign}
      saving={saving}
    >
      <div className="space-y-5">
        <Eyebrow>Terms &amp; Digital Signature</Eyebrow>
        <h2 className="text-lg text-gray-900">
          Review &amp; accept the proposal
        </h2>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded-md p-3">{error}</div>}

        {paymentType === 'Credit Card' && confirmedPaymentIntentId && (
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md p-3">
            ✓ Card authorized. Your card will be charged the moment you click <strong>Accept Proposal &amp; Sign</strong> below.
          </div>
        )}

        {/* Scrollable terms */}
        <div className="h-52 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
          {termsForChannel(channel, ag.publication)}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-purple-600 flex-shrink-0"
            required
          />
          <span className="text-sm text-gray-700">
            I accept this proposal and agree to the Terms &amp; Conditions above. I understand that
            accepting converts this proposal into a legally binding advertising agreement.
          </span>
        </label>

        <SignaturePad
          initialSignerName={ag.rep_name ?? ''}
          enabled={termsAccepted}
          onChange={setSignature}
        />

        <div className="rounded-md border border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">Signature date *</div>
          <input
            type="date"
            value={signDate}
            onChange={(e) => setSignDate(e.target.value)}
            disabled={!termsAccepted}
            className="px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:bg-gray-100"
          />
        </div>

        {canSign && (
          <p className="text-xs text-gray-500 text-center">
            Clicking &ldquo;Accept Proposal &amp; Sign&rdquo; constitutes your legally binding digital
            signature.
          </p>
        )}
      </div>
    </Shell>
  );
}

