'use client';

import { useEffect, useRef, useState } from 'react';
import StripePaymentBlock, { type StripePaymentHandle } from '@/app/admin/billing/sign/[token]/StripePaymentBlock';

type Fields = Record<string, string>;
type Summary = {
  brand: string;
  signed: boolean;
  channel: string;
  ad_size: string | null;
  frequency: string | null;
  rate_cents: number | null;
  total_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  needs_full_form: boolean;
  full_form_url: string;
  allow_check: boolean;
  card_available: boolean;
  card_charge_cents: number | null;
  fields: Fields;
  terms: string;
};

const STEPS = ['Review', 'Pay', 'Sign'] as const;

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function day(iso: string | null) {
  return iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
}

const input = 'w-full rounded-md border border-[#D8D5E6] px-3 py-2.5 text-base';

export default function AgreeClient({ token }: { token: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Fields>({});
  const [pay, setPay] = useState<'invoice' | 'check' | 'card'>('invoice');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stripeRef = useRef<StripePaymentHandle>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);

  useEffect(() => {
    let alive = true;
    const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
    fetch(`/api/agree-v2/${encodeURIComponent(token)}${preview ? '?preview=1' : ''}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'This link is not valid.');
        if (!alive) return;
        const s = j as Summary;
        setData(s);
        setFields(Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, String(v ?? '')])));
      })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : 'This link is not valid.'); });
    return () => { alive = false; };
  }, [token]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  function nextFromReview() {
    setError(null);
    if (!fields.company_name?.trim()) return setError('Please enter your company name.');
    if (!fields.rep_name?.trim()) return setError('Please enter your contact name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.advertiser_email ?? '')) return setError('Please enter a valid email address.');
    setStep(1);
  }

  async function nextFromPay() {
    setError(null);
    if (pay !== 'card') return setStep(2);
    if (cardPaid) return setStep(2);
    if (!stripeRef.current) return setError('The card form is not ready yet. Please wait a moment and try again.');
    setSubmitting(true);
    try {
      const r = await stripeRef.current.confirm();
      if ('skipped' in r) throw new Error('The card form did not load. Please reload the page.');
      setCardPaid(true);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Your card could not be processed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Please type your full name to sign.');
    if (!agree) return setError('Please accept the agreement terms to continue.');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/agree-v2/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signerName: name.trim(), termsAccepted: true, paymentMode: pay, fields }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === 'needs_full_form' && data) { window.location.href = data.full_form_url; return; }
        throw new Error(j.error || 'Something went wrong. Please try again.');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const card = 'rounded-lg border border-[#ECEAF4] bg-white p-6 shadow-sm sm:p-8';
  const pill = 'inline-flex w-full items-center justify-center rounded-md bg-[#5B3FE3] px-6 py-3 text-base font-medium text-white transition hover:bg-[#4B30CC] disabled:cursor-not-allowed disabled:opacity-60';
  const ghost = 'inline-flex items-center justify-center rounded-md border border-[#5B3FE3] px-5 py-3 text-sm font-medium text-[#5B3FE3] hover:bg-[#F3F0FF]';

  if (loadError) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[#261E5A]">This link is not available</h1>
        <p className="mt-2 text-sm text-[#4A4767]">{loadError} Please reply to your agreement email and we will send a fresh one.</p>
      </div>
    );
  }
  if (!data) return <div className={card}><p className="text-sm text-[#6E6A8A]">Loading your agreement…</p></div>;

  if (done || data.signed) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold text-[#261E5A]">You are all set</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A4767]">
          Thank you. Your advertising agreement with {data.brand} is signed. A copy of the signed agreement will be emailed to you.
        </p>
      </div>
    );
  }

  const summary = (
    <dl className="space-y-3 rounded-md bg-[#F3F0FF] p-4 text-sm">
      {data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Ad size</dt><dd className="text-right font-medium text-[#1B1726]">{data.ad_size}</dd></div>}
      {data.frequency && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Frequency</dt><dd className="text-right font-medium text-[#1B1726]">{data.frequency}</dd></div>}
      {data.start_date && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Term</dt><dd className="text-right font-medium text-[#1B1726]">{day(data.start_date)} to {day(data.end_date)}</dd></div>}
      <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Monthly rate</dt><dd className="text-right font-medium text-[#1B1726]">{money(data.rate_cents)}</dd></div>
      <div className="flex justify-between gap-4 border-t border-[#E4DFF1] pt-3"><dt className="font-semibold text-[#261E5A]">Agreement total</dt><dd className="text-right font-semibold text-[#261E5A]">{money(data.total_cents)}</dd></div>
    </dl>
  );

  if (data.needs_full_form) {
    return (
      <div className="space-y-4">
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6E6A8A]">{data.brand}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#261E5A]">Your advertising agreement</h1>
          <p className="mt-2 text-sm text-[#4A4767]">This agreement includes details we need you to confirm on the full form.</p>
          <a href={data.full_form_url} className={`${pill} mt-5`}>Continue</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6E6A8A]">{data.brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#261E5A]">Your advertising agreement</h1>
        <ol className="mt-4 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-semibold ${i === step ? 'bg-[#5B3FE3] text-white' : i < step ? 'bg-[#EFEAFB] text-[#42277C]' : 'bg-[#F0EEF6] text-[#6E6A8A]'}`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">Review your details</h2>
          <p className="mt-1 text-sm text-[#4A4767]">We filled in what we have. Fix anything that is out of date.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-[#4A4767]">Company name<input className={input} value={fields.company_name ?? ''} onChange={set('company_name')} autoComplete="organization" /></label>
            <label className="block text-sm text-[#4A4767]">Contact name<input className={input} value={fields.rep_name ?? ''} onChange={set('rep_name')} autoComplete="name" /></label>
            <label className="block text-sm text-[#4A4767]">Email<input className={input} type="email" value={fields.advertiser_email ?? ''} onChange={set('advertiser_email')} autoComplete="email" /></label>
            <label className="block text-sm text-[#4A4767]">Phone<input className={input} type="tel" value={fields.advertiser_phone ?? ''} onChange={set('advertiser_phone')} autoComplete="tel" /></label>
            <label className="block text-sm text-[#4A4767]">Street address<input className={input} value={fields.address ?? ''} onChange={set('address')} autoComplete="street-address" /></label>
            <div className="grid grid-cols-5 gap-3">
              <label className="col-span-3 block text-sm text-[#4A4767]">City<input className={input} value={fields.city ?? ''} onChange={set('city')} autoComplete="address-level2" /></label>
              <label className="col-span-1 block text-sm text-[#4A4767]">State<input className={input} value={fields.state ?? ''} onChange={set('state')} autoComplete="address-level1" /></label>
              <label className="col-span-1 block text-sm text-[#4A4767]">ZIP<input className={input} value={fields.zip ?? ''} onChange={set('zip')} autoComplete="postal-code" /></label>
            </div>
            <label className="block text-sm text-[#4A4767]">Billing email (if different)<input className={input} type="email" value={fields.billing_email ?? ''} onChange={set('billing_email')} /></label>
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#261E5A]">Your order</h3>
          {summary}
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={nextFromReview} className={`${pill} mt-5`}>Continue to payment</button>
        </div>
      )}

      {step === 1 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">How would you like to pay?</h2>
          <div className="mt-3 space-y-2">
            {data.allow_check && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'invoice' ? 'border-[#261E5A] bg-[#F3F0FF]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'invoice'} disabled={cardPaid} onChange={() => setPay('invoice')} />
                  <span>Monthly invoice</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'check' ? 'border-[#261E5A] bg-[#F3F0FF]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'check'} disabled={cardPaid} onChange={() => setPay('check')} />
                  <span>Pay by check</span>
                </label>
              </>
            )}
            {data.card_available && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'card' ? 'border-[#5B3FE3] bg-[#F3F0FF]' : 'border-[#D8D5E6]'}`}>
                  <input type="radio" name="pay" checked={pay === 'card'} onChange={() => setPay('card')} className="accent-[#5B3FE3]" />
                  <span>Credit card <span className="text-[#6E6A8A]">(first issue charged now, card saved for monthly issues)</span></span>
                </label>
                {pay === 'card' && (
                  <div className="rounded-md border border-[#D8D5E6] p-4">
                    <p className="mb-3 rounded-md bg-[#FEF8CC] p-3 text-xs text-[#645600]">
                      A 3% credit card surcharge is added. Your card will be charged {money(data.card_charge_cents)} today for the first issue.
                    </p>
                    <StripePaymentBlock ref={stripeRef} token={token} adRateCents={data.rate_cents ?? 0} onReadyChange={setCardReady} />
                  </div>
                )}
              </>
            )}
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(0)} className={ghost}>Back</button>
            <button type="button" onClick={nextFromPay} disabled={submitting || (pay === 'card' && !cardPaid && !cardReady)} className={pill}>{submitting ? 'Processing…' : pay === 'card' && !cardPaid ? `Pay ${money(data.card_charge_cents)} and continue` : 'Continue to sign'}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">Review and sign</h2>
          <div className="mt-3">{summary}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name"
            autoComplete="name"
            className="mt-4 w-full rounded-md border border-[#D8D5E6] px-3 py-3 text-base"
            style={{ fontFamily: 'cursive' }}
          />
          <label className="mt-3 flex items-start gap-3 text-sm text-[#4A4767]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-medium text-[#5B3FE3] underline">advertising agreement terms</button>{' '}
              and authorize this order.
            </span>
          </label>
          {showTerms && <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#F3F0FF] p-4 text-xs leading-relaxed text-[#4A4767]">{data.terms}</pre>}
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className={ghost}>Back</button>
            <button type="button" onClick={submit} disabled={submitting} className={pill}>{submitting ? 'Signing…' : 'Sign agreement'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
