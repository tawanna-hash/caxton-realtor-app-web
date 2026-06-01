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
import { useRouter } from 'next/navigation';
import type { Agreement } from '@/lib/agreements';
import { TERMS_RL } from '@/lib/agreement-terms';
import {
  AD_SIZES,
  FREQUENCIES,
  MONTHS_LIST,
  PAYMENT_TYPES,
  CARD_TYPES,
  BILL_TO,
} from '@/lib/pressbook-constants';
import {
  lookupRate,
  applyCcSurcharge,
  pagePositionPremium,
  computeTotal,
  computeExp,
} from '@/lib/agreement-pricing';

const ACCENT = '#D22531';
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-2xl">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div
            className="inline-block px-4 py-1 rounded text-white text-xs font-bold tracking-[0.2em] uppercase mb-3"
            style={{ background: ACCENT }}
          >
            RealtyLine
          </div>
          <h1 className="text-2xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Advertising Agreement
          </h1>
          <p className="text-sm text-gray-500 mt-1">Secure digital signing powered by RealtyLine</p>
        </div>

        <StepIndicator current={step} total={5} />

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
          {children}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          {onBack ? (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
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
              className={`px-6 py-2 rounded text-white text-sm font-medium transition-opacity ${
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
        className={`w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${
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

export default function SignWizard({ ag, token }: { ag: Agreement; token: string }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stripeRef = useRef<StripePaymentHandle>(null);

  // ── Advertiser fields ──────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState(ag.company_name ?? '');
  const [repName, setRepName] = useState(ag.rep_name ?? '');
  const [advertiserEmail, setAdvertiserEmail] = useState(ag.advertiser_email ?? '');
  const [advertiserPhone, setAdvertiserPhone] = useState(ag.advertiser_phone ?? '');
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

  // ── Billing ────────────────────────────────────────────────────────────────
  const [billTo, setBillTo] = useState<string>(ag.bill_to ?? 'Advertiser');
  const [billingEmail, setBillingEmail] = useState(ag.billing_email ?? '');
  const [billingContactName, setBillingContactName] = useState(ag.billing_contact_name ?? '');
  const [billingContactPhone, setBillingContactPhone] = useState(ag.billing_contact_phone ?? '');
  const [paymentType, setPaymentType] = useState<string>(ag.card_type ? 'Credit Card' : (ag.payment_mode === 'check' ? 'Check' : ''));
  const [cardType, setCardType] = useState(ag.card_type ?? '');
  const [cardholderName, setCardholderName] = useState(ag.cardholder_name ?? '');
  const [cardNumberLast4, setCardNumberLast4] = useState(ag.card_number_last4 ?? '');
  const [cardExpiration, setCardExpiration] = useState(ag.card_expiration ?? '');
  const [cardholderAddress, setCardholderAddress] = useState(ag.cardholder_address ?? '');

  // ── Sign step ──────────────────────────────────────────────────────────────
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signerName, setSignerName] = useState(ag.rep_name ?? '');
  const [signDate, setSignDate] = useState(new Date().toISOString().slice(0, 10));

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

  const ccSurchargeTotal = paymentType === 'Credit Card' ? applyCcSurcharge(totalMonthly) : null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function handleCardNumberChange(v: string) {
    setCardNumberLast4(v.replace(/\D/g, '').slice(0, 4));
  }

  function handleCardExpirationChange(v: string) {
    const digits = v.replace(/\D/g, '');
    if (digits.length >= 3) {
      setCardExpiration(digits.slice(0, 2) + '/' + digits.slice(2, 4));
    } else {
      setCardExpiration(v.replace(/[^0-9/]/g, ''));
    }
  }

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
      card_type: paymentType === 'Credit Card' ? (cardType || null) : null,
      cardholder_name: paymentType === 'Credit Card' ? (cardholderName || null) : null,
      card_number_last4: paymentType === 'Credit Card' ? (cardNumberLast4 || null) : null,
      card_expiration: paymentType === 'Credit Card' ? (cardExpiration || null) : null,
      cardholder_address: paymentType === 'Credit Card' ? (cardholderAddress || null) : null,
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
    if (ok) setStep((s) => s + 1);
  }

  // ── submitSignature ────────────────────────────────────────────────────────

  async function submitSignature() {
    if (!termsAccepted || !signerName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // 1. Charge the card first if Credit Card was selected and Stripe is wired.
      //    confirm() returns {skipped:true} if Stripe isn't configured (graceful fallback).
      let stripePaymentIntentId: string | null = null;
      if (paymentType === 'Credit Card' && stripeRef.current) {
        try {
          const result = await stripeRef.current.confirm();
          if ('paymentIntentId' in result) stripePaymentIntentId = result.paymentIntentId;
        } catch (e) {
          // Card declined / 3DS failed — stop here; client can fix and retry.
          const msg = e instanceof Error ? e.message : 'card authorization failed';
          setError(`Card payment failed: ${msg}. Update card details or choose Check.`);
          setSaving(false);
          return;
        }
      }

      // 2. Persist signature + patches.
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signerName: signerName.trim(),
          signedAt: signDate,
          termsAccepted: true,
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

  // ─── Step 1: Welcome ─────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <Shell step={1} onNext={() => setStep(2)}>
        <div className="text-center space-y-4">
          <div className="text-5xl">📋</div>
          <h2 className="text-xl text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Welcome, {ag.rep_name ?? 'Advertiser'}
          </h2>
          <p className="text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
            You&apos;re about to sign an <strong>Advertising Agreement</strong> with{' '}
            <strong>RealtyLine</strong> for{' '}
            <strong>{ag.company_name ?? 'your company'}</strong>.
          </p>
          <div className="inline-block rounded-lg border-l-4 p-4 text-left text-sm text-gray-700 bg-amber-50 border-amber-400 max-w-md">
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
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Your advertiser details
          </h2>
          <p className="text-sm text-gray-600">
            Fill in or update your information below. Fields marked <span className="text-red-500">*</span> are required.
          </p>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

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
              onChange={setAdvertiserPhone}
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
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Your ad details
          </h2>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

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
                    className="accent-red-600"
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
                    className="accent-red-600"
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
              <div className="w-full px-3 py-2 rounded border border-gray-200 bg-gray-100 text-sm font-bold text-gray-900">
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
                className="w-4 h-4 accent-red-600"
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
                      className="w-4 h-4 accent-red-600 flex-shrink-0"
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
                      className="w-16 px-2 py-1 rounded border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-red-400 disabled:bg-gray-100 disabled:text-gray-400"
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
    return (
      <Shell
        step={4}
        onBack={() => setStep(3)}
        onNext={handleNext}
        nextLabel="Next →"
        saving={saving}
      >
        <div className="space-y-5">
          <Eyebrow>Billing &amp; Payment</Eyebrow>
          <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
            Billing information
          </h2>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

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
                    className="accent-red-600"
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
              onChange={setBillingContactPhone}
            />
          </div>

          {/* Payment Type */}
          <div>
            <Eyebrow>Payment Type</Eyebrow>
            <div className="flex gap-4">
              {PAYMENT_TYPES.map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentType"
                    value={p}
                    checked={paymentType === p}
                    onChange={() => setPaymentType(p)}
                    className="accent-red-600"
                  />
                  <span className="text-sm text-gray-800">{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Credit Card details */}
          {paymentType === 'Credit Card' && (
            <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              {ccSurchargeTotal != null && (
                <div className="text-sm text-amber-800 rounded border border-amber-300 bg-amber-100 p-3">
                  A 3% credit card surcharge is automatically added to your ad rate.{' '}
                  <strong>New monthly: ${ccSurchargeTotal.toFixed(2)}</strong>
                </div>
              )}

              {/* Stripe Payment Element — PCI-safe card capture. Falls back gracefully if STRIPE_*_KEY env vars are not set. */}
              <div className="rounded-md bg-white p-4 border border-amber-200">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium mb-3">
                  Secure Card Payment
                </p>
                <StripePaymentBlock
                  ref={stripeRef}
                  token={token}
                  adRateCents={strToCents(adRate) ?? 0}
                  refreshKey={`${adSize}|${frequency}|${adRate}`}
                />
                <p className="text-[11px] text-gray-500 mt-2">
                  Charged at signing. Your card is securely saved for future monthly issue charges.
                </p>
              </div>

              {/* Card Type */}
              <div>
                <Eyebrow>Card Type</Eyebrow>
                <div className="flex flex-wrap gap-3">
                  {CARD_TYPES.map((ct) => (
                    <label key={ct} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cardType"
                        value={ct}
                        checked={cardType === ct}
                        onChange={() => setCardType(ct)}
                        className="accent-red-600"
                      />
                      <span className="text-sm text-gray-800">{ct}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Cardholder Name */}
              <EditableField
                label="Cardholder Name"
                value={cardholderName}
                onChange={setCardholderName}
              />

              {/* Last 4 + Expiration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <EditableField
                  label="Last 4 Digits"
                  value={cardNumberLast4}
                  onChange={handleCardNumberChange}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="1234"
                />
                <EditableField
                  label="Expiration MM/YY"
                  value={cardExpiration}
                  onChange={handleCardExpirationChange}
                  placeholder="MM/YY"
                  maxLength={5}
                />
              </div>

              {/* Cardholder Address */}
              <EditableField
                label="Cardholder Address"
                value={cardholderAddress}
                onChange={setCardholderAddress}
              />
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ─── Step 5: Terms & Sign ─────────────────────────────────────────────────

  const canSign = termsAccepted && signerName.trim() !== '' && signDate !== '';

  return (
    <Shell
      step={5}
      onBack={() => setStep(4)}
      onNext={submitSignature}
      nextLabel="Sign Agreement"
      nextDisabled={!canSign}
      saving={saving}
    >
      <div className="space-y-5">
        <Eyebrow>Terms &amp; Digital Signature</Eyebrow>
        <h2 className="text-lg text-gray-900" style={{ fontFamily: 'Georgia, serif' }}>
          Review &amp; sign the agreement
        </h2>

        {error && <div className="text-sm text-red-600 bg-red-50 rounded p-3">{error}</div>}

        {/* Scrollable terms */}
        <div className="h-52 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">
          {TERMS_RL}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-red-600 flex-shrink-0"
            required
          />
          <span className="text-sm text-gray-700">
            I have read and accept the Terms &amp; Conditions above. I understand this constitutes a
            legally binding agreement.
          </span>
        </label>

        <div
          className={`rounded border-2 p-4 space-y-3 transition-colors ${
            termsAccepted ? 'border-amber-400 bg-amber-50/40' : 'border-gray-200'
          }`}
        >
          <div className="text-xs text-gray-600 font-medium">Digital Signature</div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Type your full legal name *</div>
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              disabled={!termsAccepted}
              placeholder="Full legal name"
              className="w-full px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100 disabled:text-gray-400"
            />
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Signature date *</div>
            <input
              type="date"
              value={signDate}
              onChange={(e) => setSignDate(e.target.value)}
              disabled={!termsAccepted}
              className="px-3 py-2 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-100"
            />
          </div>
        </div>

        {canSign && (
          <p className="text-xs text-gray-500 text-center">
            Clicking &ldquo;Sign Agreement&rdquo; constitutes your legally binding digital
            signature.
          </p>
        )}
      </div>
    </Shell>
  );
}
