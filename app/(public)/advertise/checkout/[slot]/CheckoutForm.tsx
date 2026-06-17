'use client';

// CheckoutForm.tsx
//
// Self-serve checkout client: pricing, date picker, creative upload (Vercel
// Blob client-direct), terms checkbox, Stripe Elements. On submit:
//   1. POST /api/checkout/create-intent → clientSecret + amount
//   2. Confirm payment with Stripe Elements
//   3. POST /api/checkout/submit → creates ad_creatives + ad_campaigns + agreements
//   4. Show success screen
//
// Wireframe:
//   [pub picker] [billing-period picker] [duration]   →   live $ total
//   [name] [email] [phone] [company]
//   [start date] [end date]
//   [creative upload] [click URL] [alt text]
//   [terms checkbox]
//   [Stripe PaymentElement]
//   [Pay $X.XX]

import { useEffect, useMemo, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { loadStripe, type Stripe as StripeJS } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import { getSlotAvailablePubs, type AppAdSlot } from '@/lib/media-kit';

// Per product decision (2026-06-16): the legacy 'both' Austin+SA bundle
// option was removed from the public checkout. Advertisers pick exactly
// one single-pub market (Austin / SA / Houston / Dallas). Bundle buys are
// handled by admin BookingBuilder.
interface Props {
  slot: AppAdSlot;
  initialPub: 'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas';
  /** Optional pre-fill from /advertise/inquire redirect. */
  initialName?: string;
  initialEmail?: string;
  initialPhone?: string;
  initialCompany?: string;
  /**
   * Pub scopes that are CURRENTLY taken by an active campaign overlapping
   * the default window. The matching pill renders disabled + 'Sold' tooltip.
   * Cleared automatically once those campaigns expire.
   */
  bookedPubs?: Array<'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas'>;
}

type Pub = 'realtyline' | 'newsline' | 'realtyline-houston' | 'realtyline-dallas';
type BillingPeriod = 'weekly' | 'monthly' | 'unit';

interface IntentResp {
  clientSecret: string;
  publishableKey: string;
  paymentIntentId: string;
  amountCents: number;
  baseCents: number;
  surchargeCents: number;
  description: string;
}

function formatUSD(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function CheckoutForm({
  slot,
  initialPub,
  initialName = '',
  initialEmail = '',
  initialPhone = '',
  initialCompany = '',
  bookedPubs = [],
}: Props) {
  const bookedSet = new Set(bookedPubs);
  const perUnit = slot.pricingUnit === 'per send' || slot.pricingUnit === 'per push';
  const hasMonthly = slot.monthlySingle != null && slot.monthlyBoth != null;

  // Allow-list of publication scopes for this slot, narrowed to the four
  // single-pub markets the public checkout exposes. The legacy 'both'
  // bundle is intentionally excluded here — it's still accepted by the
  // server for backward compatibility with admin tooling, but the public
  // UI no longer offers it. Bundle buys go through admin BookingBuilder.
  const NARROW_PUBS: readonly Pub[] = [
    'realtyline',
    'newsline',
    'realtyline-houston',
    'realtyline-dallas',
  ];
  const isNarrowPub = (v: string): v is Pub =>
    (NARROW_PUBS as readonly string[]).includes(v);
  const availablePubs: Pub[] = getSlotAvailablePubs(slot).filter(isNarrowPub);
  // A scope is "open" if the slot is sold on it AND no active campaign
  // is currently occupying it.
  const isOpenForBooking = (p: Pub) => availablePubs.includes(p) && !bookedSet.has(p);
  const allBlocked = !availablePubs.some(isOpenForBooking);

  // If the URL passed an initialPub that this slot can't be booked on,
  // fall back to the first OPEN scope (sold + not currently booked).
  // Falls back to availablePubs[0] only if every scope is currently taken,
  // so the form still renders rather than crashing on undefined.
  const safeInitialPub: Pub = isOpenForBooking(initialPub)
    ? initialPub
    : (availablePubs.find(isOpenForBooking) ??
        availablePubs[0] ??
        'realtyline');
  const [pub, setPub] = useState<Pub>(safeInitialPub);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(
    perUnit ? 'unit' : 'weekly',
  );
  const [weeks, setWeeks] = useState(1);
  const [months, setMonths] = useState(1);
  const [units, setUnits] = useState(1);

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [company, setCompany] = useState(initialCompany);

  const [startDate, setStartDate] = useState(addDaysISO(todayISO(), 3));
  const [endDate, setEndDate] = useState(addDaysISO(todayISO(), 10));

  const [file, setFile] = useState<File | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [clickUrl, setClickUrl] = useState('');
  const [altText, setAltText] = useState('');

  const [termsAccepted, setTermsAccepted] = useState(false);

  const [intent, setIntent] = useState<IntentResp | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeJS | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<null | { agreementId: string }>(null);

  // Auto-update end date when start + duration changes.
  // Wrapped in Promise.resolve() to satisfy react-hooks/set-state-in-effect.
  useEffect(() => {
    (async () => {
      await Promise.resolve();
      if (billingPeriod === 'weekly') setEndDate(addDaysISO(startDate, weeks * 7 - 1));
      else if (billingPeriod === 'monthly') setEndDate(addDaysISO(startDate, months * 28 - 1));
      // For per-unit (push/newsletter), keep end_date = start_date + 7 default
      else setEndDate(addDaysISO(startDate, 7));
    })();
  }, [startDate, weeks, months, billingPeriod]);

  // ─── Live price preview (client-side mirror of server math) ────────────
  // All four single-pub markets use the same single-pub rate. (Houston/
  // Dallas were priced equal to a solo RealtyLine booking when those
  // markets were activated in Phase 2 PR D.)
  const previewBaseCents = useMemo(() => {
    if (perUnit) {
      return slot.weeklySingle * 100 * units;
    }
    if (billingPeriod === 'monthly' && hasMonthly) {
      return slot.monthlySingle! * 100 * months;
    }
    return slot.weeklySingle * 100 * weeks;
  }, [slot, billingPeriod, weeks, months, units, perUnit, hasMonthly]);

  const previewSurcharge = Math.round(previewBaseCents * 0.03);
  const previewTotal = previewBaseCents + previewSurcharge;

  // ─── Creative upload (Vercel Blob client-direct) ───────────────────────
  async function handleUpload(f: File) {
    setError(null);
    setUploading(true);
    try {
      const ext = (f.name.split('.').pop() || 'png').toLowerCase();
      const safeName = `${slot.slug}-${Date.now()}.${ext}`;
      const newBlob = await upload(`ads/self-serve/${safeName}`, f, {
        access: 'public',
        handleUploadUrl: '/api/checkout/upload-token',
      });
      setBlobUrl(newBlob.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  // ─── Stage 1: prepare PaymentIntent ─────────────────────────────────────
  const ready =
    !!name.trim() &&
    /.+@.+\..+/.test(email.trim()) &&
    !!startDate &&
    !!endDate &&
    !!blobUrl &&
    /^https?:\/\//.test(clickUrl.trim()) &&
    termsAccepted;

  async function prepareIntent() {
    setError(null);
    try {
      const r = await fetch('/api/checkout/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot: slot.slug,
          pub,
          billing_period: billingPeriod,
          weeks,
          months,
          units,
          name,
          email,
          phone,
          company,
          start_date: startDate,
          end_date: endDate,
          click_url: clickUrl,
          alt_text: altText || company || name,
        }),
      });
      const j = (await r.json()) as IntentResp | { error: string; detail?: string };
      if (!r.ok || !('clientSecret' in j)) {
        const e = j as { error: string; detail?: string };
        throw new Error(e.detail ? `${e.error}: ${e.detail}` : e.error);
      }
      setIntent(j);
      setStripePromise(loadStripe(j.publishableKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment');
    }
  }

  if (success) {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-6 sm:p-8 text-center">
        <div className="text-emerald-700 text-4xl mb-3">✓</div>
        <h2 className="text-2xl font-bold text-emerald-900 mb-2">You&apos;re booked.</h2>
        <p className="text-emerald-800 mb-4">
          Payment confirmed. We&apos;ll review your creative and activate the placement within one business day.
        </p>
        <p className="text-xs text-emerald-700">Confirmation #{success.agreementId.slice(0, 8)}</p>
        <p className="text-sm text-emerald-700 mt-4">
          Receipt sent to <strong>{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Pricing card ─────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          1 · Choose your run
        </h2>

        <div className="space-y-4">
          <Field label="Publication">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  'realtyline',
                  'newsline',
                  'realtyline-houston',
                  'realtyline-dallas',
                ] as const
              ).map((p) => {
                const sold = availablePubs.includes(p);
                const taken = bookedSet.has(p);
                const allowed = sold && !taken;
                const active = pub === p && allowed;
                const label =
                  p === 'realtyline'
                    ? 'RealtyLine Austin'
                    : p === 'newsline'
                      ? 'Newsline San Antonio'
                      : p === 'realtyline-houston'
                        ? 'RealtyLine Houston'
                        : 'RealtyLine Dallas/FTW';
                const title = allowed
                  ? undefined
                  : taken
                    ? `${label} is currently booked. Please check back later.`
                    : `${label} is not available for this placement.`;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => allowed && setPub(p)}
                    disabled={!allowed}
                    aria-disabled={!allowed}
                    aria-pressed={active}
                    title={title}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : allowed
                          ? 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                          : 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    {label}
                    {taken && (
                      <span className="ml-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700">
                        sold
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {bookedSet.size > 0 && !allBlocked && (
              <p className="mt-2 text-xs text-amber-700">
                One or more publications are currently booked for this placement.
              </p>
            )}
            {allBlocked && (
              <p className="mt-2 text-xs text-amber-800 font-medium">
                This placement is fully booked right now. Use the inquiry form to join the waitlist.
              </p>
            )}
          </Field>

          {!perUnit && (
            <Field label="Billing">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBillingPeriod('weekly')}
                  className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    billingPeriod === 'weekly'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                  }`}
                >
                  Weekly
                </button>
                {hasMonthly && (
                  <button
                    type="button"
                    onClick={() => setBillingPeriod('monthly')}
                    className={`flex-1 px-4 py-2 rounded-lg border text-sm font-medium transition ${
                      billingPeriod === 'monthly'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                    }`}
                  >
                    Monthly (save ~7%)
                  </button>
                )}
              </div>
            </Field>
          )}

          <Field label={perUnit ? `Number of ${slot.pricingUnit === 'per send' ? 'sends' : 'pushes'}` : (billingPeriod === 'monthly' ? 'Months' : 'Weeks')}>
            <input
              type="number"
              min={1}
              max={perUnit ? 20 : billingPeriod === 'monthly' ? 12 : 52}
              value={perUnit ? units : billingPeriod === 'monthly' ? months : weeks}
              onChange={(e) => {
                const v = Math.max(1, parseInt(e.target.value || '1', 10));
                if (perUnit) setUnits(v);
                else if (billingPeriod === 'monthly') setMonths(v);
                else setWeeks(v);
              }}
              className="w-32 rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </Field>

          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
            <div className="flex justify-between text-sm text-slate-600 mb-1">
              <span>Subtotal</span>
              <span>{formatUSD(previewBaseCents)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600 mb-2">
              <span>3% card processing</span>
              <span>{formatUSD(previewSurcharge)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-300 pt-2">
              <span>Total</span>
              <span>{formatUSD(previewTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Contact ─────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          2 · Your info
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Your name *">
            <Input value={name} onChange={setName} placeholder="Jane Smith" />
          </Field>
          <Field label="Email *">
            <Input value={email} onChange={setEmail} type="email" placeholder="jane@company.com" />
          </Field>
          <Field label="Company">
            <Input value={company} onChange={setCompany} placeholder="Acme Builders" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={setPhone} placeholder="(512) 555-1234" />
          </Field>
        </div>
      </div>

      {/* ── Dates ───────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          3 · Run dates
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Start date">
            <Input
              type="date"
              value={startDate}
              onChange={setStartDate}
              min={todayISO()}
            />
          </Field>
          <Field label="End date">
            <Input
              type="date"
              value={endDate}
              onChange={setEndDate}
              min={startDate}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500 mt-3">End date auto-adjusts when you change duration. Override it if you need specific dates.</p>
      </div>

      {/* ── Creative ────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          4 · Creative
        </h2>
        <p className="text-sm text-slate-600 mb-3">
          Spec: <strong>{slot.sizes}</strong>. PNG, JPG, or WebP. Up to 10 MB.
        </p>

        {blobUrl ? (
          <div className="rounded-lg border border-slate-200 p-3 mb-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={blobUrl} alt="creative preview" className="max-h-24 rounded border border-slate-200" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{file?.name ?? 'creative.png'}</p>
              <button
                type="button"
                onClick={() => {
                  setBlobUrl(null);
                  setFile(null);
                }}
                className="text-xs text-slate-500 hover:text-slate-900 underline mt-1"
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <label className="block rounded-lg border-2 border-dashed border-slate-300 hover:border-slate-500 transition cursor-pointer p-6 text-center mb-4">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  handleUpload(f);
                }
              }}
            />
            <p className="text-sm font-medium text-slate-700">
              {uploading ? 'Uploading…' : 'Click to upload your ad creative'}
            </p>
            <p className="text-xs text-slate-500 mt-1">{slot.sizes}</p>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Click-through URL *">
            <Input value={clickUrl} onChange={setClickUrl} type="url" placeholder="https://your-site.com/landing" />
          </Field>
          <Field label="Alt text (accessibility)">
            <Input value={altText} onChange={setAltText} placeholder={`${company || name || 'Acme'} — Spring builder showcase`} />
          </Field>
        </div>
      </div>

      {/* ── Terms ───────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          5 · Agreement terms
        </h2>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 leading-relaxed max-h-44 overflow-y-auto mb-4">
          <p className="mb-2"><strong>Insertion Order — Self-Serve.</strong> By checking the box below and authorizing payment, you (&quot;Advertiser&quot;) agree to the following:</p>
          <p className="mb-2">1. <strong>Creative Approval.</strong> RealtyLine Austin & Newsline San Antonio (&quot;Publisher&quot;) reserves the right to reject any creative that does not meet spec, contains misleading claims, or conflicts with editorial standards. If rejected, Publisher will issue a full refund within 5 business days.</p>
          <p className="mb-2">2. <strong>Placement & Delivery.</strong> The campaign runs from the start date through the end date selected, displayed in the placement and publication you selected. Impressions are best-effort against committed inventory; Publisher does not guarantee CTR or conversion outcomes.</p>
          <p className="mb-2">3. <strong>Payment.</strong> Card payment includes a 3% processing surcharge (shown above) and is charged in full at booking. No refunds after creative goes live except for verified delivery failures.</p>
          <p className="mb-2">4. <strong>Indemnification.</strong> Advertiser warrants it owns or has license to all creative content, including images, logos, and trademarks, and agrees to indemnify Publisher against third-party IP claims.</p>
          <p>5. <strong>Cancellation.</strong> Pre-launch cancellations get a full refund. Mid-flight cancellations are pro-rated minus a 15% restocking fee.</p>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          <span className="text-sm text-slate-700">
            I have read and accept the terms above. I&apos;m authorized to book ads on behalf of {company || 'my company'}.
          </span>
        </label>
      </div>

      {/* ── Payment ─────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          6 · Payment
        </h2>

        {!intent ? (
          <div>
            <p className="text-sm text-slate-600 mb-4">
              Click below to authorize <strong>{formatUSD(previewTotal)}</strong>. You&apos;ll enter your card details on the next step.
            </p>
            <button
              type="button"
              disabled={!ready}
              onClick={prepareIntent}
              className="w-full px-6 py-3 rounded-lg bg-slate-900 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800 transition"
            >
              {ready ? `Continue to card → ${formatUSD(previewTotal)}` : 'Complete steps above to continue'}
            </button>
            {!ready && (
              <ul className="mt-3 text-xs text-slate-500 space-y-1">
                {!name.trim() && <li>· Enter your name</li>}
                {!/.+@.+\..+/.test(email.trim()) && <li>· Enter a valid email</li>}
                {!blobUrl && <li>· Upload your ad creative</li>}
                {!/^https?:\/\//.test(clickUrl.trim()) && <li>· Enter a click-through URL (https://...)</li>}
                {!termsAccepted && <li>· Accept the agreement terms</li>}
              </ul>
            )}
          </div>
        ) : stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret: intent.clientSecret,
              appearance: { theme: 'stripe', labels: 'floating' },
            }}
          >
            <PayBlock
              intent={intent}
              blobUrl={blobUrl!}
              onSuccess={(agreementId) => setSuccess({ agreementId })}
              onError={(m) => setError(m)}
            />
          </Elements>
        ) : null}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-sm"
    />
  );
}

function PayBlock({
  intent,
  blobUrl,
  onSuccess,
  onError,
}: {
  intent: IntentResp;
  blobUrl: string;
  onSuccess: (agreementId: string) => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      const { error: submitErr } = await elements.submit();
      if (submitErr) throw new Error(submitErr.message ?? 'Card validation failed');

      const result = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });
      if (result.error) throw new Error(result.error.message ?? 'Payment failed');

      // Payment ok → persist booking on server
      const r = await fetch('/api/checkout/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: intent.paymentIntentId,
          blob_url: blobUrl,
        }),
      });
      const j = (await r.json()) as { ok?: boolean; agreementId?: string; error?: string; detail?: string };
      if (!r.ok || !j.ok || !j.agreementId) {
        throw new Error(j.detail ?? j.error ?? 'Booking record failed');
      }
      onSuccess(j.agreementId);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      <button
        type="button"
        disabled={paying || !stripe || !elements}
        onClick={pay}
        className="w-full px-6 py-3 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-700 transition"
      >
        {paying ? 'Processing…' : `Pay ${(intent.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`}
      </button>
      <p className="text-xs text-slate-500 text-center">
        Secured by Stripe. Your card never touches our servers.
      </p>
    </div>
  );
}
