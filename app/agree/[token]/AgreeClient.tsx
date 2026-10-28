'use client';

import { useEffect, useState } from 'react';
import BillingTimeline, { type TimelineView } from '@/components/anchor/TimelineView';
import EmbeddedPay from './EmbeddedPay';
import SignaturePad, { type SignatureValue } from '@/components/SignaturePad';

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
  prepay_required?: boolean;
  prepay_note?: string | null;
  check_request?: 'requested' | 'approved' | null;
  annual_increase_pct?: number;
  bank_now_available?: boolean;
  bank_invoice_available?: boolean;
  bank_fee_cents?: number | null;
  bank_charge_cents?: number | null;
  timeline_bank_now?: TimelineView;
  timeline_bank_invoice?: TimelineView;
  card_available: boolean;
  stripe_publishable_key?: string | null;
  card_charge_cents: number | null;
  card_base_cents: number | null;
  lines: Array<{ line_no?: number; package_label: string; description: string | null; channel: string; quantity: number; amount_cents: number; pay_now: boolean; optional?: boolean; discount_note?: string | null }>;
  needs_option?: boolean;
  options?: Array<{ name: string; total_cents: number; lines: Array<{ line_no: number; package_label: string; description: string | null; amount_cents: number; optional: boolean; discount_note: string | null }> }> | null;
  expired: boolean;
  intro?: string;
  details: { name: string | null; note: string | null; ask_address: boolean; refs: Array<{ name: string; value: string }>; expires_at: string | null } | null;
  placement: { lines: PlacementNeed[]; single: PlacementNeed | null };
  schedule_view?: 'timeline' | 'occurrence';
  schedule_groups?: Array<{ title: string; total_cents: number; items: Array<{ label: string; cents: number }> }> | null;
  timeline_check: TimelineView;
  timeline_card: TimelineView;
  fields: Fields;
  terms: string;
};

const RAIL = ['Introduction', 'Review Services', 'Terms of Service', 'Additional Terms', 'Payment', 'Sign & Approve'] as const;

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function day(iso: string | null) {
  return iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
}

const input = 'w-full rounded-[10px] border border-[color:var(--ds-line)] px-3 py-2.5 text-base';

export default function AgreeClient({ token }: { token: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Fields>({});
  const cardMethod = 'card' as const;
  const [pay, setPay] = useState<'check' | 'card' | 'bank_now' | 'bank_invoice' | 'ap'>('check');
  const [apEmail, setApEmail] = useState('');
  const [apSentTo, setApSentTo] = useState('');
  const [name, setName] = useState('');
  const [sig, setSig] = useState<SignatureValue>({ method: 'type', signerName: '' });
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Anchor-style flow: landing page, introduction, then the steps. 'terms' and 'additional' sit between review and payment.
  const [phase, setPhase] = useState<'landing' | 'intro' | 'flow'>('landing');
  const [inter, setInter] = useState<null | 'terms' | 'additional'>(null);
  const [cardReady, _setCardReady] = useState(false);
  const [cardPaid, setCardPaid] = useState(false);
  const [bankPi, setBankPi] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bankReady, _setBankReady] = useState(false);
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

  const [checkAsked, setCheckAsked] = useState(false);
  async function requestCheck() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch(`/api/agree-v2/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'request_check' }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not send your request.');
      setCheckAsked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send your request.');
    } finally {
      setSubmitting(false);
    }
  }

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
    if (data?.details?.ask_address || (fields.address ?? '').trim()) {
      for (const [k, label] of [['address', 'street address'], ['city', 'city'], ['state', 'state'], ['zip', 'ZIP code']] as const) {
        if (!(fields[k] ?? '').trim()) return setError(`Please enter your ${label}.`);
      }
    }
    for (const n of needs) {
      if (!dates[n.line_no]?.[0]) return setError(n.channel === 'email' ? `Please choose a preferred send date for ${n.label}.` : `Please choose a start date for ${n.label}.`);
    }
    setInter('terms');
  }

  async function nextFromPay() {
    setError(null);
    if (pay === 'bank_now') {
      if (bankPi) return setStep(2);
      return setError('Please complete the bank payment above to continue.');
    }
    if (pay === 'ap') {
      const email = apEmail.trim();
      if (apSentTo && apSentTo === email) return setStep(2);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter the email address of the person who will add the payment method.');
      setSubmitting(true);
      try {
        const r = await fetch(`/api/ad-sign/${encodeURIComponent(token)}/ach-setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'later', email }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not send the request.');
        setApSentTo(email);
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send the request.');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (pay !== 'card') return setStep(2);
    if (cardPaid) return setStep(2);
    return setError('Please complete the card payment above to continue.');
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
      let signedDocumentUrl: string | undefined;
      const blob = sig.method === 'draw' ? sig.pngBlob : sig.method === 'upload' ? sig.file : null;
      if (sig.method !== 'type') {
        if (!blob) throw new Error(sig.method === 'draw' ? 'Please draw your signature before continuing.' : 'Please choose a signature file to upload.');
        const fd = new FormData();
        fd.append('file', blob, sig.method === 'draw' ? 'signature.png' : (sig.file?.name ?? 'signature'));
        fd.append('kind', 'signature');
        const up = await fetch(`/api/sign/${encodeURIComponent(token)}/upload`, { method: 'POST', body: fd });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok || !uj.url) throw new Error(uj.error || 'Could not upload your signature.');
        signedDocumentUrl = uj.url as string;
      }
      const res = await fetch(`/api/agree-v2/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signMethod: sig.method, signedDocumentUrl, signerName: name.trim(), termsAccepted: true, paymentMode: pay, checkoutSessionId: sessionId ?? undefined, fields, placement: buildPlacement() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.code === 'needs_full_form') throw new Error('This agreement is not ready for online signing. Please contact us.');
        throw new Error(j.error || 'Something went wrong. Please try again.');
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const card = 'rounded-[14px] border border-[color:var(--ds-line)] bg-white p-6 shadow-sm sm:p-8';
  const pill = 'inline-flex w-full items-center justify-center rounded-[10px] bg-[color:var(--ds-primary)] px-6 py-3 text-base font-medium text-white transition hover:bg-[color:var(--ds-primary-press)] disabled:cursor-not-allowed disabled:opacity-60';
  const ghost = 'inline-flex items-center justify-center rounded-[10px] border border-[color:var(--ds-primary)] px-5 py-3 text-sm font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-hover)]';

  if (loadError) {
    return (
      <div className={`${card} mx-auto max-w-lg`}>
        <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">This link is not available</h1>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">{loadError} Please reply to your agreement email and we will send a fresh one.</p>
      </div>
    );
  }
  if (!data) return <div className={`${card} mx-auto max-w-lg`}><p className="text-sm text-[color:var(--ds-body)]">Loading your agreement…</p></div>;

  if (done || data.signed) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-16 text-center">
        <svg width="120" height="110" viewBox="0 0 120 110" fill="none" aria-hidden="true">
          <rect x="22" y="14" width="66" height="76" rx="12" fill="#CDBFF9" />
          <rect x="34" y="30" width="26" height="5" rx="2.5" fill="#582BE7" />
          <rect x="34" y="42" width="38" height="5" rx="2.5" fill="#582BE7" />
          <path d="M38 72c6-12 10-12 12-4s6 4 16-6" stroke="#4B1FB8" strokeWidth="3" strokeLinecap="round" />
          <circle cx="92" cy="82" r="18" fill="#047857" />
          <path d="M83 82l7 7 12-14" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h1 className="mt-6 text-2xl font-semibold text-[color:var(--ds-ink)]">Thanks for signing</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--ds-body)]">
          Your agreement with {data.brand} has been approved. A copy of the signed agreement will be emailed to you.
        </p>
      </div>
    );
  }

  const summary = (
    <dl className="space-y-3 rounded-[10px] bg-[color:var(--ds-selected)] p-4 text-sm">
      {data.lines.map((l, i) => (
        <div key={i}>
          <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">{l.package_label}{l.quantity > 1 ? ` × ${l.quantity}` : ''}</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{money(l.amount_cents)}</dd></div>
          {l.discount_note && <p className="text-xs text-green-700">{l.discount_note}</p>}
          {l.description && <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--ds-body)]">{l.description}</p>}
        </div>
      ))}
      {data.lines.length === 0 && data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Ad size</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{data.ad_size}</dd></div>}
      {data.lines.length === 0 && data.frequency && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Frequency</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{data.frequency}</dd></div>}
      {data.start_date && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Term</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{day(data.start_date)} to {day(data.end_date)}</dd></div>}
      {data.lines.length === 0 && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">{data.channel === 'email' ? 'Price per send' : data.channel === 'app' ? 'Rate' : 'Monthly rate'}</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{money(data.rate_cents)}</dd></div>}
      {data.lines.length === 0 && data.channel === 'email' && data.rate_cents && data.total_cents ? <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Sends</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{Math.max(1, Math.round(data.total_cents / data.rate_cents))}</dd></div> : null}
      {data.details?.refs.map((r, i) => <div key={`ref${i}`} className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">{r.name}</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{r.value}</dd></div>)}
      <div className="flex justify-between gap-4 border-t border-[color:var(--ds-line)] pt-3"><dt className="font-semibold text-[color:var(--ds-ink)]">Agreement total</dt><dd className="text-right font-semibold text-[color:var(--ds-ink)]">{money(data.total_cents)}</dd></div>
    </dl>
  );

  if (data.expired) {
    return (
      <div className={`${card} mx-auto max-w-lg`}>
        <h1 className="text-2xl font-semibold text-[color:var(--ds-ink)]">This agreement has expired</h1>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">Please contact {data.brand} and we will send you a new one.</p>
      </div>
    );
  }

  if (data.needs_full_form) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className={card}>
          <p className="text-xs font-semibold text-[color:var(--ds-body)]">{data.brand}</p>
          <h1 className="mt-1 text-2xl font-semibold text-[color:var(--ds-ink)]">Your advertising agreement</h1>
          <p className="mt-2 text-sm text-[color:var(--ds-body)]">This agreement is not ready for online signing yet. Please contact us and we will finish setting it up.</p>
        </div>
      </div>
    );
  }

  const company = fields.company_name || data.details?.name || data.brand;
  if (phase === 'landing') {
    return (
      <div className="mx-auto max-w-2xl px-2 py-10" data-anchor-ui="true">
        <h1 className="text-3xl font-semibold tracking-[-0.02em] text-[color:var(--ds-ink)]">Proposal for review</h1>
        <p className="mt-3 text-xl font-semibold text-[color:var(--ds-ink)]">Prepared for {company}</p>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">{data.brand} has sent you this proposal for your review and approval.</p>
        <hr className="my-6 border-[color:var(--ds-line)]" />
        <p className="text-xs text-[color:var(--ds-body)]">Recipients</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-[color:var(--ds-ink)]">{fields.rep_name || 'You'}<span className="rounded-full border border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)] px-2.5 py-0.5 text-xs font-medium text-[color:var(--ds-primary-press)]">Required to sign</span></p>
        <button type="button" onClick={() => setPhase('intro')} className={`${pill} mt-8 !w-auto`}>Get Started<span aria-hidden="true" className="ml-2">&rarr;</span></button>
      </div>
    );
  }

  const railIndex = phase === 'intro' ? 0 : inter === 'terms' ? 2 : inter === 'additional' ? 3 : step === 0 ? 1 : step === 1 ? 4 : 5;
  const goRail = (i: number) => {
    // Only go back to places already visited.
    if (i >= railIndex || cardPaid || bankPi) return;
    if (i === 0) { setPhase('intro'); setInter(null); setStep(0); }
    else if (i === 1) { setPhase('flow'); setInter(null); setStep(0); }
    else if (i === 2) { setPhase('flow'); setInter('terms'); setStep(0); }
    else if (i === 3) { setPhase('flow'); setInter('additional'); setStep(0); }
  };
  const nextBtn = 'inline-flex w-full items-center justify-center rounded-[10px] bg-[color:var(--ds-primary)] px-6 py-3 text-sm font-medium text-white hover:bg-[color:var(--ds-primary-press)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-72';
  const stepTitle = (t: string, back?: () => void) => (
    <div className="flex items-center gap-3">
      {back && <button type="button" aria-label="Back" onClick={back} className="text-xl text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }}>&lsaquo;</button>}
      <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">{t}</h1>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]" data-anchor-ui="true">
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <p className="text-lg font-semibold leading-snug text-[color:var(--ds-ink)]">{data.brand}</p>
        <p className="mt-2 text-xs text-[color:var(--ds-body)] lg:hidden">Step {railIndex + 1} of {RAIL.length}: {RAIL[railIndex]}</p>
        <ol className="mt-6 hidden space-y-1 lg:block" aria-label="Progress">
          {RAIL.map((label, i) => (
            <li key={label}>
              <button type="button" onClick={() => goRail(i)} disabled={i >= railIndex} aria-current={i === railIndex ? 'step' : undefined}
                className={`block w-full border-l-2 px-3 py-2 text-left text-sm ${i === railIndex ? 'border-[color:var(--ds-primary)] font-semibold text-[color:var(--ds-primary)]' : i < railIndex ? 'border-transparent text-[color:var(--ds-ink)] hover:text-[color:var(--ds-primary)]' : 'border-transparent text-[color:var(--ds-placeholder)]'}`}
                style={{ background: 'transparent', borderTop: 0, borderRight: 0, borderBottom: 0, borderRadius: 0 }}>{label}</button>
            </li>
          ))}
        </ol>
      </aside>
      <div className="mx-auto w-full max-w-2xl space-y-4">
      {phase === 'intro' && (
        <>
          {stepTitle('Introduction', () => setPhase('landing'))}
          <div className={card}><p className="whitespace-pre-line text-sm leading-relaxed text-[color:var(--ds-ink)]">{data.intro || 'Your advertising agreement is ready. Review the details, choose how to pay, and sign.'}</p></div>
          <div className="flex justify-end"><button type="button" onClick={() => setPhase('flow')} className={nextBtn}>Next</button></div>
        </>
      )}

      {phase === 'flow' && inter === 'terms' && (
        <>
          {stepTitle('Review Terms of Service', () => setInter(null))}
          <div className={card}><pre className="max-h-[28rem] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[color:var(--ds-ink)]" style={{ fontFamily: 'inherit' }}>{data.terms}</pre></div>
          <div className="flex justify-end"><button type="button" onClick={() => setInter('additional')} className={nextBtn}>Next</button></div>
        </>
      )}

      {phase === 'flow' && inter === 'additional' && (
        <>
          {stepTitle('Review Additional Terms', () => setInter('terms'))}
          <div className={`${card} space-y-4`}>
            <div><p className="text-sm font-semibold text-[color:var(--ds-ink)]">Effective Date of Agreement</p><p className="text-xs text-[color:var(--ds-body)]">On acceptance</p></div>
            <div><p className="text-sm font-semibold text-[color:var(--ds-ink)]">Payment Terms</p><p className="text-xs text-[color:var(--ds-body)]">{data.prepay_required ? (data.prepay_note || 'Payment is due before services begin.') : 'Payment is due as shown on each invoice.'}</p></div>
            {(data.annual_increase_pct ?? 0) > 0 && <div><p className="text-sm font-semibold text-[color:var(--ds-ink)]">Annual Pricing</p><p className="text-xs text-[color:var(--ds-body)]">Pricing increases by {data.annual_increase_pct}% each contract year after the first. Renewals are capped at a 2% increase.</p></div>}
            <div><p className="text-sm font-semibold text-[color:var(--ds-ink)]">Amendments</p><p className="text-xs text-[color:var(--ds-body)]">Any change to the agreement will require your approval.</p></div>
          </div>
          <div className="flex justify-end"><button type="button" onClick={() => { setInter(null); setStep(1); }} className={nextBtn}>Next</button></div>
        </>
      )}

      {phase === 'flow' && !inter && step === 0 && !data.expired && (data.needs_option || data.lines.some((l) => l.optional)) && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">{data.needs_option ? 'Choose your package' : 'Choose your services'}</h2>
          <p className="mt-1 text-sm text-[color:var(--ds-body)]">{data.needs_option ? 'Pick the option that fits you best. You can still review everything before you pay.' : 'Untick anything you do not want.'}</p>
          <div className="mt-4 space-y-4">
            {(data.needs_option && data.options ? data.options : [{ name: '', total_cents: data.lines.reduce((n, l) => n + l.amount_cents, 0), lines: data.lines.map((l) => ({ line_no: l.line_no ?? 0, package_label: l.package_label, description: l.description, amount_cents: l.amount_cents, optional: l.optional === true, discount_note: l.discount_note ?? null })) }]).map((o, oi) => {
              const active = !data.needs_option || pickedOption === oi;
              return (
                <div key={oi} className={`rounded-[10px] border p-4 ${active ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                  {data.needs_option && (
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold text-[color:var(--ds-ink)]">
                      <span className="flex items-center gap-2"><input type="radio" name="pkg" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={pickedOption === oi} onChange={() => { setPickedOption(oi); setDeclined([]); }} />{o.name}</span>
                      <span>{money(o.total_cents)}</span>
                    </label>
                  )}
                  <ul className={`${data.needs_option ? 'mt-3' : ''} space-y-3 text-sm`}>
                    {o.lines.map((l) => (
                      <li key={l.line_no}>
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-start gap-2 text-[color:var(--ds-ink)]">
                            {l.optional && active ? <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[color:var(--ds-primary)]" checked={!declined.includes(l.line_no)} onChange={(e) => setDeclined((d) => (e.target.checked ? d.filter((n) => n !== l.line_no) : [...d, l.line_no]))} /> : null}
                            <span>{l.package_label}{l.optional ? <span className="ml-2 rounded-full border border-[color:var(--ds-line)] px-2 py-0.5 text-[10px] text-[color:var(--ds-body)]">Optional</span> : null}</span>
                          </label>
                          <span className="font-medium text-[color:var(--ds-ink)]">{money(l.amount_cents)}</span>
                        </div>
                        {l.discount_note && <div className="text-xs text-green-700">{l.discount_note}</div>}
                        {l.description && <p className="mt-1 whitespace-pre-line text-xs text-[color:var(--ds-body)]">{l.description}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {error && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={submitChoice} disabled={submitting} className={`${pill} mt-5`}>{submitting ? 'Saving…' : 'Continue'}</button>
        </div>
      )}

      {phase === 'flow' && !inter && step === 0 && !(data.needs_option || data.lines.some((l) => l.optional)) && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Review your details</h2>
          <p className="mt-1 text-sm text-[color:var(--ds-body)]">We filled in what we have. Fix anything that is out of date.</p>
          <div className="mt-4 space-y-3">
            <label className="block text-sm text-[color:var(--ds-body)]">Company name<input className={input} value={fields.company_name ?? ''} onChange={set('company_name')} autoComplete="organization" /></label>
            <label className="block text-sm text-[color:var(--ds-body)]">Contact name<input className={input} value={fields.rep_name ?? ''} onChange={set('rep_name')} autoComplete="name" /></label>
            <label className="block text-sm text-[color:var(--ds-body)]">Email<input className={input} type="email" value={fields.advertiser_email ?? ''} onChange={set('advertiser_email')} autoComplete="email" /></label>
            <label className="block text-sm text-[color:var(--ds-body)]">Phone<input className={input} type="tel" value={fields.advertiser_phone ?? ''} onChange={set('advertiser_phone')} autoComplete="tel" /></label>
            <label className="block text-sm text-[color:var(--ds-body)]">Billing address<input className={input} value={fields.address ?? ''} onChange={set('address')} autoComplete="street-address" /></label>
            <div className="grid grid-cols-5 gap-3">
              <label className="col-span-3 block text-sm text-[color:var(--ds-body)]">City<input className={input} value={fields.city ?? ''} onChange={set('city')} autoComplete="address-level2" /></label>
              <label className="col-span-1 block text-sm text-[color:var(--ds-body)]">State<input className={input} value={fields.state ?? ''} onChange={set('state')} autoComplete="address-level1" /></label>
              <label className="col-span-1 block text-sm text-[color:var(--ds-body)]">ZIP<input className={input} value={fields.zip ?? ''} onChange={set('zip')} autoComplete="postal-code" /></label>
            </div>
            <label className="block text-sm text-[color:var(--ds-body)]">Billing email (if different)<input className={input} type="email" value={fields.billing_email ?? ''} onChange={set('billing_email')} /></label>
          </div>
          {needs.length > 0 && (
            <div className="mt-6 space-y-4">
              <h3 className="text-sm font-semibold text-[color:var(--ds-ink)]">Placement details</h3>
              {needs.map((n) => (
                <div key={n.line_no} className="rounded-[10px] border border-[color:var(--ds-line)] p-4">
                  <div className="mb-2 text-sm font-medium text-[color:var(--ds-ink)]">{n.label}{n.channel === 'email' ? ' send dates' : ' start date'}</div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {(n.channel === 'email' ? SEND_LABELS : ['Start date']).map((label, i) => (
                      <label key={label} className="block text-xs text-[color:var(--ds-body)]">
                        {label}{i === 0 && <span className="text-red-700"> *</span>}
                        <input
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={dates[n.line_no]?.[i] ?? ''}
                          onChange={(e) => setDates((d) => { const row = [...(d[n.line_no] ?? [])]; row[i] = e.target.value; return { ...d, [n.line_no]: row }; })}
                          className="mt-1 w-full border border-[color:var(--ds-line)] text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  {n.channel === 'email' && <p className="mt-2 text-xs text-[color:var(--ds-body)]">Optional dates are backups if your preferred date is taken.</p>}
                </div>
              ))}
            </div>
          )}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-[color:var(--ds-ink)]">Your order</h3>
          {summary}
          {data.details?.note && <p className="mt-3 whitespace-pre-line rounded-[10px] border border-[color:var(--ds-line)] p-3 text-sm text-[color:var(--ds-body)]">{data.details.note}</p>}
          {error && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={nextFromReview} className={`${pill} mt-5`}>Continue to payment</button>
        </div>
      )}

      {phase === 'flow' && !inter && step === 1 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">How would you like to pay?</h2>
          {data.prepay_note && <p className="mt-2 rounded-[10px] bg-[#FEF8CC] p-3 text-sm text-[#645600]">{data.prepay_note}</p>}
          <div className="mt-3 space-y-2">
            {data.allow_check && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'check' ? 'border-[color:var(--ds-ink)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                  <input type="radio" name="pay" checked={pay === 'check'} disabled={cardPaid} onChange={() => setPay('check')} />
                  <span>Pay by check</span>
                </label>
              </>
            )}
            {data.card_available && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'card' && cardMethod === 'card' ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                  <input type="radio" name="pay" checked={pay === 'card' && cardMethod === 'card'} onChange={() => { setPay('card'); }} className="accent-[color:var(--ds-primary)]" />
                  <span>Credit card <span className="text-[color:var(--ds-body)]">(charged now, card saved for later issues)</span></span>
                </label>
                {pay === 'card' && cardMethod === 'card' && (
                  <div className="rounded-[10px] border border-[color:var(--ds-line)] p-4">
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-[color:var(--ds-ink)]">Card details</p>
                      <p className="mt-1 text-xs text-[color:var(--ds-body)]">Enter your card below. Your card details are handled securely by Stripe and never stored on our servers.</p>
                    </div>
                    <p className="mb-3 rounded-[10px] bg-[#FEF8CC] p-3 text-xs text-[#645600]">
                      A 3% credit card surcharge is added. Your card will be charged {money(data.card_charge_cents)} today{data.lines.length > 0 ? ' for the items due now' : ' for the first issue'}.
                    </p>
                    <EmbeddedPay key="card" token={token} method="card" publishableKey={data.stripe_publishable_key ?? ''} onError={setError} onComplete={(sid) => { setSessionId(sid); setCardPaid(true); setStep(2); }} />
                  </div>
                )}
              </>
            )}
            {(data.annual_increase_pct ?? 0) > 0 && <p className="text-xs text-[color:var(--ds-body)]">Pricing increases by {data.annual_increase_pct}% each contract year after the first. Renewals are capped at a 2% increase.</p>}
            {data.bank_now_available && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'bank_now' ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                  <input type="radio" name="pay" checked={pay === 'bank_now'} disabled={cardPaid} onChange={() => setPay('bank_now')} className="accent-[color:var(--ds-primary)]" />
                  <span>Bank account (ACH), pay now <span className="text-[color:var(--ds-body)]">(debited today, 1% fee, $5 maximum)</span></span>
                </label>
                {pay === 'bank_now' && (
                  <div className="rounded-[10px] border border-[color:var(--ds-line)] p-4">
                    <p className="mb-3 rounded-[10px] bg-[#FEF8CC] p-3 text-xs text-[#645600]">
                      A bank payment fee of 1% (maximum $5) is added: {money(data.bank_fee_cents ?? 0)} on this order. {money(data.bank_charge_cents ?? null)} will be debited from your bank account{data.lines.length > 0 ? ' for the items due now' : ' for the first issue'}. Bank payments can take a few business days to clear.
                    </p>
                    <EmbeddedPay key="bank" token={token} method="bank" publishableKey={data.stripe_publishable_key ?? ''} onError={setError} onComplete={(sid) => { setSessionId(sid); setBankPi(sid); setStep(2); }} />
                  </div>
                )}
              </>
            )}
            {data.prepay_required && !data.allow_check && (
              <div className="rounded-[10px] border border-[color:var(--ds-line)] p-4 text-sm text-[color:var(--ds-body)]">
                {data.check_request === 'requested' || checkAsked ? (
                  <p>Your request to pay by check was sent. We will let you know once it is approved. Your service will not be scheduled until your check is received. You can also pay now by bank account or credit card.</p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>Need to pay by check? Ask for approval first. Your service will not be scheduled until your check is received.</span>
                    <button type="button" onClick={requestCheck} disabled={submitting} className="rounded-[10px] border border-[color:var(--ds-line)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)] disabled:opacity-60">Ask to pay by check</button>
                  </div>
                )}
              </div>
            )}
            {data.prepay_required && data.allow_check && data.check_request === 'approved' && <p className="text-xs text-[color:var(--ds-body)]">Check payment was approved. Your service will not be scheduled until your check is received.</p>}
            {(data.card_available || data.bank_now_available) && (
              <div className={`rounded-[10px] border p-4 text-sm ${pay === 'ap' ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="radio" name="pay" checked={pay === 'ap'} disabled={cardPaid} onChange={() => setPay('ap')} className="accent-[color:var(--ds-primary)]" />
                  <span>Ask someone else to add a card or bank account <span className="text-[color:var(--ds-body)]">(for example, Accounts Payable)</span></span>
                </label>
                {pay === 'ap' && (
                  <div className="mt-3 pl-7">
                    <label className="mb-1 block text-xs text-[color:var(--ds-body)]" htmlFor="ap-email">Their email address</label>
                    <input id="ap-email" type="email" value={apEmail} onChange={(e) => setApEmail(e.target.value)} placeholder="ap@company.com" className="w-full rounded-[10px] border border-[color:var(--ds-line)] px-3 py-2 text-sm" />
                    <p className="mt-2 text-xs text-[color:var(--ds-body)]">We will email them a secure link. {data.prepay_required ? 'Your service will not be scheduled until payment is received.' : ''}</p>
                  </div>
                )}
              </div>
            )}
            {data.bank_invoice_available && (
              <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'bank_invoice' ? 'border-[color:var(--ds-primary)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                <input type="radio" name="pay" checked={pay === 'bank_invoice'} disabled={cardPaid} onChange={() => setPay('bank_invoice')} className="accent-[color:var(--ds-primary)]" />
                <span>Invoiced, pay each invoice by bank (ACH) <span className="text-[color:var(--ds-body)]">(nothing is charged today)</span></span>
              </label>
            )}
          </div>
          <div className="mt-6 rounded-[10px] border border-[color:var(--ds-line)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[color:var(--ds-ink)]">Billing timeline</h3>
            {(pay === 'check' || pay === 'bank_invoice') && data.schedule_view === 'occurrence' && data.schedule_groups?.length ? (
              <div className="space-y-4">
                {data.schedule_groups.map((g, i) => (
                  <div key={i}>
                    <div className="text-sm font-semibold text-[color:var(--ds-ink)]">{g.title}{g.total_cents > 0 ? ` - ${money(g.total_cents)}` : ''}</div>
                    <ul className="mt-1 list-disc pl-5 text-sm text-[color:var(--ds-body)]">{g.items.map((it, k) => <li key={k}>{it.label} <span className="text-[color:var(--ds-body)]">{money(it.cents)}</span></li>)}</ul>
                  </div>
                ))}
              </div>
            ) : (
              <BillingTimeline timeline={pay === 'card' ? data.timeline_card : pay === 'bank_now' ? (data.timeline_bank_now ?? null) : pay === 'bank_invoice' ? (data.timeline_bank_invoice ?? null) : data.timeline_check} empty="Your billing dates will be confirmed after you sign." />
            )}
          </div>
          {error && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => { setStep(0); setInter('additional'); }} className={ghost}>Back</button>
            <button type="button" onClick={nextFromPay} disabled={submitting || (pay === 'ap' && !apEmail.trim()) || (pay === 'card' && !cardPaid && !cardReady) || (pay === 'bank_now' && !bankPi && !bankReady)} className={pill}>{submitting ? 'Processing…' : pay === 'card' && !cardPaid ? `Pay ${money(data.card_charge_cents)} and continue` : pay === 'bank_now' && !bankPi ? `Pay ${money(data.bank_charge_cents ?? null)} by bank and continue` : 'Continue to sign'}</button>
          </div>
        </div>
      )}

      {phase === 'flow' && !inter && step === 2 && (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Review and sign</h2>
          <div className="mt-3">{summary}</div>
          <div className="mt-4"><SignaturePad initialSignerName={name} enabled onChange={(v) => { setSig(v); setName(v.signerName); }} /></div>
          <label className="mt-3 flex items-start gap-3 text-sm text-[color:var(--ds-body)]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-medium text-[color:var(--ds-primary)] underline">advertising agreement terms</button>{' '}
              and authorize this order.
            </span>
          </label>
          {showTerms && <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-[color:var(--ds-selected)] p-4 text-xs leading-relaxed text-[color:var(--ds-body)]">{data.terms}</pre>}
          {error && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => setStep(1)} className={ghost}>Back</button>
            <button type="button" onClick={submit} disabled={submitting} className={pill}>{submitting ? 'Signing…' : 'Sign agreement'}</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
