'use client';

import { useEffect, useState } from 'react';

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

const input = 'w-full rounded-xl border border-[#D9D5E8] px-3 py-2.5 text-base';

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

  function nextFromPay() {
    setError(null);
    if (pay === 'card' && data) { window.location.href = data.full_form_url; return; }
    setStep(2);
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

  const card = 'rounded-3xl border border-[#ECE8F5] bg-white p-6 shadow-sm sm:p-8';
  const pill = 'inline-flex w-full items-center justify-center rounded-full bg-[#301D5D] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[#42277C] disabled:cursor-not-allowed disabled:opacity-60';
  const ghost = 'inline-flex items-center justify-center rounded-full border border-[#D9D5E8] px-5 py-3 text-sm font-medium text-[#301D5D] hover:bg-[#F6F5FB]';

  if (loadError) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[#301D5D]">This link is not available</h1>
        <p className="mt-2 text-sm text-[#4A4757]">{loadError} Please reply to your agreement email and we will send a fresh one.</p>
      </div>
    );
  }
  if (!data) return <div className={card}><p className="text-sm text-[#6B6878]">Loading your agreement…</p></div>;

  if (done || data.signed) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold text-[#301D5D]">You are all set</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A4757]">
          Thank you. Your advertising agreement with {data.brand} is signed. A copy of the signed agreement will be emailed to you.
        </p>
      </div>
    );
  }

  const summary = (
    <dl className="space-y-3 rounded-2xl bg-[#F6F5FB] p-4 text-sm">
      {data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[#6B6878]">Ad size</dt><dd className="text-right font-medium text-[#1B1726]">{data.ad_size}</dd></div>}
      {data.frequency && <div className="flex justify-between gap-4"><dt className="text-[#6B6878]">Frequency</dt><dd className="text-right font-medium text-[#1B1726]">{data.frequency}</dd></div>}
      {data.start_date && <div className="flex justify-between gap-4"><dt className="text-[#6B6878]">Term</dt><dd className="text-right font-medium text-[#1B1726]">{day(data.start_date)} to {day(data.end_date)}</dd></div>}
      <div className="flex justify-between gap-4"><dt className="text-[#6B6878]">Monthly rate</dt><dd className="text-right font-medium text-[#1B1726]">{money(data.rate_cents)}</dd></div>
      <div className="flex justify-between gap-4 border-t border-[#E4DFF1] pt-3"><dt className="font-semibold text-[#301D5D]">Agreement total</dt><dd className="text-right font-semibold text-[#301D5D]">{money(data.total_cents)}</dd></div>
    </dl>
  );

  if (data.needs_full_form) {
    return (
      <div className="space-y-4">
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B6878]">{data.brand}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#301D5D]">Your advertising agreement</h1>
          <p className="mt-2 text-sm text-[#4A4757]">This agreement includes details we need you to confirm on the full form.</p>
          <a href={data.full_form_url} className={`${pill} mt-5`}>Continue</a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6B6878]">{data.brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#301D5D]">Your advertising agreement</h1>
        <ol className="mt-4 flex gap-2" aria-label="Progress">
          {STEPS.map((label, i) => (
            <li key={label} className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-semibold ${i === step ? 'bg-[#301D5D] text-white' : i < step ? 'bg-[#EFEAFB] text-[#42277C]' : 'bg-[#F0EEF6] text-[#6B6878]'}`}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#301D5D]">Review your details</h2>
          <p className="mt-1 text-sm text-[#4A4757]">We filled in what we have. Fix anything that is out of date.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-[#4A4757]">Company name<input className={input} value={fields.company_name ?? ''} onChange={set('company_name')} autoComplete="organization" /></label>
            <label className="block text-sm text-[#4A4757]">Contact name<input className={input} value={fields.rep_name ?? ''} onChange={set('rep_name')} autoComplete="name" /></label>
            <label className="block text-sm text-[#4A4757]">Email<input className={input} type="email" value={fields.advertiser_email ?? ''} onChange={set('advertiser_email')} autoComplete="email" /></label>
            <label className="block text-sm text-[#4A4757]">Phone<input className={input} type="tel" value={fields.advertiser_phone ?? ''} onChange={set('advertiser_phone')} autoComplete="tel" /></label>
            <label className="block text-sm text-[#4A4757]">Street address<input className={input} value={fields.address ?? ''} onChange={set('address')} autoComplete="street-address" /></label>
            <div className="grid grid-cols-5 gap-3">
              <label className="col-span-3 block text-sm text-[#4A4757]">City<input className={input} value={fields.city ?? ''} onChange={set('city')} autoComplete="address-level2" /></label>
              <label className="col-span-1 block text-sm text-[#4A4757]">State<input className={input} value={fields.state ?? ''} onChange={set('state')} autoComplete="address-level1" /></label>
              <label className="col-span-1 block text-sm text-[#4A4757]">ZIP<input className={input} value={fields.zip ?? ''} onChange={set('zip')} autoComplete="postal-code" /></label>
            </div>
            <label className="block text-sm text-[#4A4757]">Billing email (if different)<input className={input} type="email" value={fields.billing_email ?? ''} onChange={set('billing_email')} /></label>
          </div>
          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#301D5D]">Your order</h3>
          {summary}
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={nextFromReview} className={`${pill} mt-5`}>Continue to payment</button>
        </div>
      )}

      {step === 1 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#301D5D]">How would you like to pay?</h2>
          <div className="mt-3 space-y-2">
            {data.allow_check && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm ${pay === 'invoice' ? 'border-[#301D5D] bg-[#F6F5FB]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'invoice'} onChange={() => setPay('invoice')} />
                  <span>Monthly invoice</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm ${pay === 'check' ? 'border-[#301D5D] bg-[#F6F5FB]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'check'} onChange={() => setPay('check')} />
                  <span>Pay by check</span>
                </label>
              </>
            )}
            <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 text-sm ${pay === 'card' ? 'border-[#301D5D] bg-[#F6F5FB]' : 'border-[#E4DFF1]'}`}>
              <input type="radio" name="pay" checked={pay === 'card'} onChange={() => setPay('card')} />
              <span>Credit card <span className="text-[#6B6878]">(continues on the secure card form)</span></span>
            </label>
          </div>
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(0)} className={ghost}>Back</button>
            <button type="button" onClick={nextFromPay} className={pill}>{pay === 'card' ? 'Continue to card form' : 'Continue to sign'}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#301D5D]">Review and sign</h2>
          <div className="mt-3">{summary}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name"
            autoComplete="name"
            className="mt-4 w-full rounded-xl border border-[#D9D5E8] px-3 py-3 text-base"
            style={{ fontFamily: 'cursive' }}
          />
          <label className="mt-3 flex items-start gap-3 text-sm text-[#4A4757]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-medium text-[#6D3FD6] underline">advertising agreement terms</button>{' '}
              and authorize this order.
            </span>
          </label>
          {showTerms && <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-[#F6F5FB] p-4 text-xs leading-relaxed text-[#4A4757]">{data.terms}</pre>}
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className={ghost}>Back</button>
            <button type="button" onClick={submit} disabled={submitting} className={pill}>{submitting ? 'Signing…' : 'Sign agreement'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
