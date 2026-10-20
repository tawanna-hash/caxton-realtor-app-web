'use client';

import { useEffect, useState } from 'react';

type Summary = {
  brand: string;
  signed: boolean;
  offer_expired: boolean;
  offer_expires_at: string | null;
  company_name: string | null;
  rep_name: string | null;
  channel: string;
  ad_size: string | null;
  frequency: string | null;
  months: number;
  rate_cents: number | null;
  total_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  needs_full_form: boolean;
  full_form_url: string;
  allow_check: boolean;
  card_on_file: { brand: string; last4: string } | null;
  payment_mode: string | null;
  billing: { email: string | null; contact_name: string | null };
  terms: string;
};

function money(c: number | null) {
  return c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function day(iso: string | null) {
  return iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
}

export default function RenewClient({ token }: { token: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [pay, setPay] = useState<'card' | 'invoice' | 'check' | ''>('');
  const [billingEmail, setBillingEmail] = useState('');
  const [billingContact, setBillingContact] = useState('');
  const [editBilling, setEditBilling] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    const preview = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';
    fetch(`/api/renew-v2/${encodeURIComponent(token)}${preview ? '?preview=1' : ''}`)
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'This link is not valid.');
        if (!alive) return;
        const s = j as Summary;
        setData(s);
        setBillingEmail(s.billing.email ?? '');
        setBillingContact(s.billing.contact_name ?? '');
        setPay(s.card_on_file ? 'card' : s.allow_check ? 'invoice' : '');
      })
      .catch((e: unknown) => { if (alive) setLoadError(e instanceof Error ? e.message : 'This link is not valid.'); });
    return () => { alive = false; };
  }, [token]);

  async function submit() {
    setError(null);
    if (!pay) { setError('Please choose how you would like to pay.'); return; }
    if (!name.trim()) { setError('Please type your full name to sign.'); return; }
    if (!agree) { setError('Please accept the agreement terms to continue.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/renew-v2/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          signerName: name.trim(),
          termsAccepted: true,
          paymentMode: pay,
          billing_email: billingEmail,
          billing_contact_name: billingContact,
        }),
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
  const pill = 'inline-flex w-full items-center justify-center rounded-md bg-[#5B3FE3] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[#4B30CC] disabled:cursor-not-allowed disabled:opacity-60';

  if (loadError) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[#261E5A]">This link is not available</h1>
        <p className="mt-2 text-sm text-[#4A4767]">{loadError} Please reply to your renewal email and we will send a fresh one.</p>
      </div>
    );
  }
  if (!data) return <div className={card}><p className="text-sm text-[#6E6A8A]">Loading your renewal…</p></div>;

  if (done || data.signed) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold text-[#261E5A]">You are renewed</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#4A4767]">
          Thank you{data.rep_name ? `, ${data.rep_name}` : ''}. Your advertising agreement with {data.brand} is signed. A copy of the signed agreement will be emailed to you.
        </p>
      </div>
    );
  }

  if (data.offer_expired) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[#261E5A]">This renewal offer has expired</h1>
        <p className="mt-2 text-sm text-[#4A4767]">The rate hold on this renewal has ended. Please reply to your renewal email and we will send an updated offer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6E6A8A]">{data.brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#261E5A]">Renew your advertising</h1>
        <p className="mt-2 text-sm text-[#4A4767]">We filled this out for you. Confirm the details, choose how to pay, and sign.</p>

        <dl className="mt-5 space-y-3 rounded-md bg-[#F3F0FF] p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Advertiser</dt><dd className="text-right font-medium text-[#1B1726]">{data.company_name}</dd></div>
          {data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Ad size</dt><dd className="text-right font-medium text-[#1B1726]">{data.ad_size}</dd></div>}
          {data.frequency && <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Frequency</dt><dd className="text-right font-medium text-[#1B1726]">{data.frequency}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Term</dt><dd className="text-right font-medium text-[#1B1726]">{day(data.start_date)} to {day(data.end_date)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[#6E6A8A]">Monthly rate</dt><dd className="text-right font-medium text-[#1B1726]">{money(data.rate_cents)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-[#E4DFF1] pt-3"><dt className="font-semibold text-[#261E5A]">Agreement total</dt><dd className="text-right font-semibold text-[#261E5A]">{money(data.total_cents)}</dd></div>
        </dl>
        {data.offer_expires_at && (
          <p className="mt-3 text-xs text-[#6E6A8A]">
            Rate held until {new Date(data.offer_expires_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} Central.
          </p>
        )}
      </div>

      {data.needs_full_form ? (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">One more step</h2>
          <p className="mt-2 text-sm text-[#4A4767]">This renewal includes details we need you to confirm on the full form.</p>
          <a href={data.full_form_url} className={`${pill} mt-4`}>Continue</a>
        </div>
      ) : (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[#261E5A]">Payment</h2>
          <div className="mt-3 space-y-2">
            {data.card_on_file && (
              <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'card' ? 'border-[#261E5A] bg-[#F3F0FF]' : 'border-[#E4DFF1]'}`}>
                <input type="radio" name="pay" checked={pay === 'card'} onChange={() => setPay('card')} />
                <span>Card on file ending {data.card_on_file.last4}</span>
              </label>
            )}
            {data.allow_check && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'invoice' ? 'border-[#261E5A] bg-[#F3F0FF]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'invoice'} onChange={() => setPay('invoice')} />
                  <span>Monthly invoice</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-4 text-sm ${pay === 'check' ? 'border-[#261E5A] bg-[#F3F0FF]' : 'border-[#E4DFF1]'}`}>
                  <input type="radio" name="pay" checked={pay === 'check'} onChange={() => setPay('check')} />
                  <span>Pay by check</span>
                </label>
              </>
            )}
          </div>

          <div className="mt-5 rounded-md border border-[#E4DFF1] p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[#6E6A8A]">Invoices and receipts go to</p>
                <p className="font-medium text-[#1B1726]">{billingEmail || 'No billing email yet'}</p>
              </div>
              <button type="button" onClick={() => setEditBilling((v) => !v)} className="rounded-md border border-[#5B3FE3] px-3 py-1 text-xs font-medium text-[#261E5A]">
                {editBilling ? 'Done' : 'Change'}
              </button>
            </div>
            {editBilling && (
              <div className="mt-3 space-y-2">
                <input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} placeholder="Billing contact name" className="w-full rounded-md border border-[#D8D5E6] px-3 py-2.5 text-sm" />
                <input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} type="email" placeholder="Billing email" className="w-full rounded-md border border-[#D8D5E6] px-3 py-2.5 text-sm" />
              </div>
            )}
          </div>

          <h2 className="mt-6 text-lg font-semibold text-[#261E5A]">Sign</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name"
            autoComplete="name"
            className="mt-3 w-full rounded-md border border-[#D8D5E6] px-3 py-3 text-base"
            style={{ fontFamily: 'cursive' }}
          />
          <label className="mt-3 flex items-start gap-3 text-sm text-[#4A4767]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-medium text-[#5B3FE3] underline">
                advertising agreement terms
              </button>{' '}
              and authorize this renewal.
            </span>
          </label>
          {showTerms && (
            <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-[#F3F0FF] p-4 text-xs leading-relaxed text-[#4A4767]">{data.terms}</pre>
          )}
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={submit} disabled={submitting} className={`${pill} mt-5`}>
            {submitting ? 'Signing…' : 'Sign & renew'}
          </button>
          <p className="mt-3 text-center text-xs text-[#6E6A8A]">
            Need to change the size or schedule?{' '}
            <a href={data.full_form_url} className="font-medium text-[#5B3FE3] underline">Use the full form</a>
          </p>
        </div>
      )}
    </div>
  );
}
