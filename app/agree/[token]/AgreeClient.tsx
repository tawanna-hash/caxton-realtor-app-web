'use client';

import { useEffect, useRef, useState } from 'react';
import BillingTimeline, { type TimelineView } from '@/components/anchor/TimelineView';
import StripePaymentBlock, { type StripePaymentHandle } from '@/app/admin/billing/sign/[token]/StripePaymentBlock';

type Fields = Record<string, string>;
type PlacementNeed = { line_no: number; label: string; channel: 'email' | 'app'; start_date: string | null; preferred_send_dates: string[] };
const SEND_LABELS = ['Preferred send date', 'Optional send date 1', 'Optional send date 2', 'Optional send date 3'];
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
  annual_increase_pct?: number;
  bank_now_available?: boolean;
  bank_invoice_available?: boolean;
  bank_fee_cents?: number | null;
  bank_charge_cents?: number | null;
  timeline_bank_now?: TimelineView;
  timeline_bank_invoice?: TimelineView;
  card_available: boolean;
  card_charge_cents: number | null;
  card_base_cents: number | null;
  lines: Array<{ line_no?: number; package_label: string; description: string | null; channel: string; quantity: number; amount_cents: number; pay_now: boolean; optional?: boolean; discount_note?: string | null }>;
  needs_option?: boolean;
  options?: Array<{ name: string; total_cents: number; lines: Array<{ line_no: number; package_label: string; description: string | null; amount_cents: number; optional: boolean; discount_note: string | null }> }> | null;
  expired: boolean;
  details: { name: string | null; note: string | null; ask_address: boolean; refs: Array<{ name: string; value: string }>; expires_at: string | null } | null;
  placement: { lines: PlacementNeed[]; single: PlacementNeed | null };
  schedule_view?: 'timeline' | 'occurrence';
  schedule_groups?: Array<{ title: string; total_cents: number; items: Array<{ label: string; cents: number }> }> | null;
  timeline_check: TimelineView;
  timeline_card: TimelineView;
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
  const [pay, setPay] = useState<'check' | 'card' | 'bank_now' | 'bank_invoice'>('check');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const stripeRef = useRef<StripePaymentHandle>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const [bankPi, setBankPi] = useState<string | null>(null);
  const bankRef = useRef<StripePaymentHandle>(null);
  const [bankReady, setBankReady] = useState(false);
  // Placement dates keyed by line number (0 = single-product agreement). Index 0 is the start / preferred date.
  const [dates, setDates] = useState<Record<number, string[]>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [pickedOption, setPickedOption] = useState(0);
  const [declined, setDeclined] = useState<number[]>([]);

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
        if (!s.allow_check) setPay(s.card_available ? 'card' : s.bank_now_available ? 'bank_now' : s.bank_invoice_available ? 'bank_invoice' : 'card');
        const seed: Record<number, string[]> = {};
        for (const n of [...s.placement.lines, ...(s.placement.single ? [s.placement.single] : [])]) {
          seed[n.line_no] = n.channel === 'email'
            ? [n.preferred_send_dates[0] ?? n.start_date ?? '', n.preferred_send_dates[1] ?? '', n.preferred_send_dates[2] ?? '', n.preferred_send_dates[3] ?? '']
            : [n.start_date ?? ''];
        }
        setDates(seed);
        setFields(Object.fromEntries(Object.entries(s.fields).map(([k, v]) => [k, String(v ?? '')])));
      })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : 'This link is not valid.'); });
    return () => { alive = false; };
  }, [token, reloadKey]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const needs: PlacementNeed[] = data ? [...data.placement.lines, ...(data.placement.single ? [data.placement.single] : [])] : [];

  async function submitChoice() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/agree-v2/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'choose', option: data?.needs_option ? pickedOption : undefined, declined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save your choice.');
      setDeclined([]);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your choice.');
    } finally {
      setSubmitting(false);
    }
  }

  function nextFromReview() {
    setError(null);
    if (!fields.company_name?.trim()) return setError('Please enter your company name.');
    if (!fields.rep_name?.trim()) return setError('Please enter your contact name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.advertiser_email ?? '')) return setError('Please enter a valid email address.');
    if (data?.details?.ask_address) {
      for (const [k, label] of [['address', 'street address'], ['city', 'city'], ['state', 'state'], ['zip', 'ZIP code']] as const) {
        if (!(fields[k] ?? '').trim()) return setError(`Please enter your ${label}.`);
      }
    }
    for (const n of needs) {
      if (!dates[n.line_no]?.[0]) return setError(n.channel === 'email' ? `Please choose a preferred send date for ${n.label}.` : `Please choose a start date for ${n.label}.`);
    }
    setStep(1);
  }

  async function nextFromPay() {
    setError(null);
    if (pay === 'bank_now') {
      if (bankPi) return setStep(2);
      if (!bankRef.current) return setError('The bank form is not ready yet. Please wait a moment and try again.');
      setSubmitting(true);
      try {
        const r = await bankRef.current.confirm();
        if ('skipped' in r) throw new Error('The bank form did not load. Please reload the page.');
        setBankPi(r.paymentIntentId);
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your bank payment could not be started.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
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

  function buildPlacement() {
    if (!data) return undefined;
    const pick = (n: PlacementNeed) => (n.channel === 'email'
      ? { preferred_send_dates: (dates[n.line_no] ?? []).filter(Boolean) }
      : { start_date: dates[n.line_no]?.[0] });
    return {
      lines: data.placement.lines.map((n) => ({ line_no: n.line_no, ...pick(n) })),
      single: data.placement.single ? pick(data.placement.single) : undefined,
    };
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
        body: JSON.stringify({ signerName: name.trim(), termsAccepted: true, paymentMode: pay, bankPaymentIntentId: pay === 'bank_now' ? bankPi : undefined, fields, placement: buildPlacement() }),
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
      {data.lines.map((l, i) => (
        <div key={i}>
          <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">{l.package_label}{l.quantity > 1 ? ` × ${l.quantity}` : ''}</dt><dd className="text-right font-medium text-[#1B1726]">{money(l.amount_cents)}</dd></div>
          {l.discount_note && <p className="text-xs text-green-700">{l.discount_note}</p>}
          {l.description && <p className="mt-1 whitespace-pre-line text-xs text-[#4A4767]">{l.description}</p>}
        </div>
      ))}
      {data.lines.length === 0 && data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Ad size</dt><dd className="text-right font-medium text-[#1B1726]">{data.ad_size}</dd></div>}
      {data.lines.length === 0 && data.frequency && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Frequency</dt><dd className="text-right font-medium text-[#1B1726]">{data.frequency}</dd></div>}
      {data.start_date && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Term</dt><dd className="text-right font-medium text-[#1B1726]">{day(data.start_date)} to {day(data.end_date)}</dd></div>}
      {data.lines.length === 0 && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Monthly rate</dt><dd className="text-right font-medium text-[#1B1726]">{money(data.rate_cents)}</dd></div>}
      {data.details?.refs.map((r, i) => <div key={`ref${i}`} className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">{r.name}</dt><dd className="text-right font-medium text-[#1B1726]">{r.value}</dd></div>)}
      <div className="flex justify-between gap-4 border-t border-[#E4DFF1] pt-3"><dt className="font-semibold text-[#261E5A]">Agreement total</dt><dd className="text-right font-semibold text-[#261E5A]">{money(data.total_cents)}</dd></div>
    </dl>
  );

  if (data.expired) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold text-[#261E5A]">This agreement has expired</h1>
        <p className="mt-2 text-sm text-[#4A4767]">Please contact {data.brand} and we will send you a new one.</p>
      </div>
    );
  }

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

      {step === 0 && !data.expired && (data.needs_option || data.lines.some((l) => l.optional)) && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">{data.needs_option ? 'Choose your package' : 'Choose your services'}</h2>
          <p className="mt-1 text-sm text-[#4A4767]">{data.needs_option ? 'Pick the option that fits you best. You can still review everything before you pay.' : 'Untick anything you do not want.'}</p>
          <div className="mt-4 space-y-4">
            {(data.needs_option && data.options ? data.options : [{ name: '', total_cents: data.lines.reduce((n, l) => n + l.amount_cents, 0), lines: data.lines.map((l) => ({ line_no: l.line_no ?? 0, package_label: l.package_label, description: l.description, amount_cents: l.amount_cents, optional: l.optional === true, discount_note: l.discount_note ?? null })) }]).map((o, oi) => {
              const active = !data.needs_option || pickedOption === oi;
              return (
                <div key={oi} className={`rounded-md border p-4 ${active ? 'border-[#5B3FE3] bg-[#F7F5FF]' : 'border-[#ECEAF4]'}`}>
                  {data.needs_option && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[#261E5A]">
                      <span className="flex items-center gap-2"><input type="radio" name="pkg" className="h-4 w-4 accent-[#5B3FE3]" checked={pickedOption === oi} onChange={() => { setPickedOption(oi); setDeclined([]); }} />{o.name}</span>
                      <span>{money(o.total_cents)}</span>
                    </label>
                  )}
                  <ul className={`${data.needs_option ? 'mt-3' : ''} space-y-3 text-sm`}>
                    {o.lines.map((l) => (
                      <li key={l.line_no}>
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-2 text-[#261E5A]">
                            {l.optional && active ? <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#5B3FE3]" checked={!declined.includes(l.line_no)} onChange={(e) => setDeclined((d) => (e.target.checked ? d.filter((n) => n !== l.line_no) : [...d, l.line_no]))} /> : null}
                            <span>{l.package_label}{l.optional ? <span className="ml-2 rounded-full border border-[#D8D5E6] px-2 py-0.5 text-[10px] text-[#6E6A8A]">Optional</span> : null}</span>
                          </label>
                          <span className="font-medium text-[#1B1726]">{money(l.amount_cents)}</span>
                        </div>
                        {l.discount_note && <div className="text-xs text-green-700">{l.discount_note}</div>}
                        {l.description && <p className="mt-1 whitespace-pre-line text-xs text-[#4A4767]">{l.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={submitChoice} disabled={submitting} className={`${pill} mt-5`}>{submitting ? 'Saving…' : 'Continue'}</button>
        </div>
      )}

      {step === 0 && !(data.needs_option || data.lines.some((l) => l.optional)) && (
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
          {needs.length > 0 && (
            <div className="mt-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#261E5A]">Placement details</h3>
              {needs.map((n) => (
                <div key={n.line_no} className="rounded-md border border-[#ECEAF4] p-4">
                  <div className="mb-2 text-sm font-medium text-[#261E5A]">{n.label}{n.channel === 'email' ? ' send dates' : ' start date'}</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(n.channel === 'email' ? SEND_LABELS : ['Start date']).map((label, i) => (
                      <label key={label} className="block text-xs text-[#4A4767]">
                        {label}{i === 0 && <span className="text-red-700"> *</span>}
                        <input
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={dates[n.line_no]?.[i] ?? ''}
                          onChange={(e) => setDates((d) => { const row = [...(d[n.line_no] ?? [])]; row[i] = e.target.value; return { ...d, [n.line_no]: row }; })}
                          className="mt-1 w-full border border-[#D8D5E6] text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  {n.channel === 'email' && <p className="mt-2 text-xs text-[#6E6A8A]">Optional dates are backups if your preferred date is taken.</p>}
                </div>
              ))}
            </div>
          )}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-[#261E5A]">Your order</h3>
          {summary}
          {data.details?.note && <p className="mt-3 whitespace-pre-line rounded-md border border-[#ECEAF4] p-3 text-sm text-[#4A4767]">{data.details.note}</p>}
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
                  <span>Credit card <span className="text-[#6E6A8A]">(charged now, card saved for later issues)</span></span>
                </label>
                {pay === 'card' && (
                  <div className="rounded-md border border-[#D8D5E6] p-4">
                    <p className="mb-3 rounded-md bg-[#FEF8CC] p-3 text-xs text-[#645600]">
                      A 3% credit card surcharge is added. Your card will be charged {money(data.card_charge_cents)} today{data.lines.length > 0 ? ' for the items due now' : ' for the first issue'}.
                    </p>
                    <StripePaymentBlock ref={stripeRef} token={token} adRateCents={data.card_base_cents ?? 0} onReadyChange={setCardReady} />
                  </div>
                )}
              </>
            )}
            {(data.annual_increase_pct ?? 0) > 0 && <p className="text-xs text-[#6E6A8A]">Pricing increases by {data.annual_increase_pct}% each contract year after the first. Renewals are capped at a 2% increase.</p>}
            {data.bank_now_available && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'bank_now' ? 'border-[#5B3FE3] bg-[#F3F0FF]' : 'border-[#D8D5E6]'}`}>
                  <input type="radio" name="pay" checked={pay === 'bank_now'} disabled={cardPaid} onChange={() => setPay('bank_now')} className="accent-[#5B3FE3]" />
                  <span>Bank account (ACH), pay now <span className="text-[#6E6A8A]">(debited today)</span></span>
                </label>
                {pay === 'bank_now' && (
                  <div className="rounded-md border border-[#D8D5E6] p-4">
                    <p className="mb-3 rounded-md bg-[#FEF8CC] p-3 text-xs text-[#645600]">
                      A bank payment fee of {money(data.bank_fee_cents ?? 0)} is added. {money(data.bank_charge_cents ?? null)} will be debited from your bank account{data.lines.length > 0 ? ' for the items due now' : ' for the first issue'}. Bank payments can take a few business days to clear.
                    </p>
                    <StripePaymentBlock ref={bankRef} token={token} endpoint={`/api/agree-v2/${encodeURIComponent(token)}/bank-intent`} adRateCents={data.card_base_cents ?? data.bank_charge_cents ?? 0} onReadyChange={setBankReady} />
                  </div>
                )}
              </>
            )}
            {data.bank_invoice_available && (
              <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'bank_invoice' ? 'border-[#5B3FE3] bg-[#F3F0FF]' : 'border-[#D8D5E6]'}`}>
                <input type="radio" name="pay" checked={pay === 'bank_invoice'} disabled={cardPaid} onChange={() => setPay('bank_invoice')} className="accent-[#5B3FE3]" />
                <span>Invoiced, pay each invoice by bank (ACH) <span className="text-[#6E6A8A]">(nothing is charged today)</span></span>
              </label>
            )}
          </div>
          <div className="mt-6 rounded-md border border-[#ECEAF4] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#261E5A]">Billing timeline</h3>
            {(pay === 'check' || pay === 'bank_invoice') && data.schedule_view === 'occurrence' && data.schedule_groups?.length ? (
              <div className="space-y-4">
                {data.schedule_groups.map((g, i) => (
                  <div key={i}>
                    <div className="text-sm font-semibold text-[#261E5A]">{g.title}{g.total_cents > 0 ? ` - ${money(g.total_cents)}` : ''}</div>
                    <ul className="mt-1 list-disc pl-5 text-sm text-[#4A4767]">{g.items.map((it, k) => <li key={k}>{it.label} <span className="text-[#6E6A8A]">{money(it.cents)}</span></li>)}</ul>
                  </div>
                ))}
              </div>
            ) : (
              <BillingTimeline timeline={pay === 'card' ? data.timeline_card : pay === 'bank_now' ? (data.timeline_bank_now ?? null) : pay === 'bank_invoice' ? (data.timeline_bank_invoice ?? null) : data.timeline_check} empty="Your billing dates will be confirmed after you sign." />
            )}
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(0)} className={ghost}>Back</button>
            <button type="button" onClick={nextFromPay} disabled={submitting || (pay === 'card' && !cardPaid && !cardReady) || (pay === 'bank_now' && !bankPi && !bankReady)} className={pill}>{submitting ? 'Processing…' : pay === 'card' && !cardPaid ? `Pay ${money(data.card_charge_cents)} and continue` : pay === 'bank_now' && !bankPi ? `Pay ${money(data.bank_charge_cents ?? null)} by bank and continue` : 'Continue to sign'}</button>
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
