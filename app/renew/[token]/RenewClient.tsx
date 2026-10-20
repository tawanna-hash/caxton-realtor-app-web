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
  const [pay, setPay] = useState<'card' | 'check' | ''>('');
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
        setPay(s.card_on_file ? 'card' : s.allow_check ? 'check' : '');
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

  const card = 'rounded-[14px] border border-[color:var(--ds-line)] bg-white p-6 shadow-sm sm:p-8';
  const pill = 'inline-flex w-full items-center justify-center rounded-[10px] bg-[color:var(--ds-primary)] px-6 py-3.5 text-base font-semibold text-white transition hover:bg-[color:var(--ds-primary-press)] disabled:cursor-not-allowed disabled:opacity-60';

  if (loadError) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">This link is not available</h1>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">{loadError} Please reply to your renewal email and we will send a fresh one.</p>
      </div>
    );
  }
  if (!data) return <div className={card}><p className="text-sm text-[color:var(--ds-body)]">Loading your renewal…</p></div>;

  if (done || data.signed) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold text-[color:var(--ds-ink)]">You are renewed</h1>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--ds-body)]">
          Thank you{data.rep_name ? `, ${data.rep_name}` : ''}. Your advertising agreement with {data.brand} is signed. A copy of the signed agreement will be emailed to you.
        </p>
      </div>
    );
  }

  if (data.offer_expired) {
    return (
      <div className={card}>
        <h1 className="text-xl font-semibold text-[color:var(--ds-ink)]">This renewal offer has expired</h1>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">The rate hold on this renewal has ended. Please reply to your renewal email and we will send an updated offer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-anchor-ui="true">
      <div className={card}>
        <p className="text-xs font-semibold text-[color:var(--ds-body)]">{data.brand}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[color:var(--ds-ink)]">Renew your advertising</h1>
        <p className="mt-2 text-sm text-[color:var(--ds-body)]">We filled this out for you. Confirm the details, choose how to pay, and sign.</p>

        <dl className="mt-5 space-y-3 rounded-[10px] bg-[color:var(--ds-selected)] p-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Advertiser</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{data.company_name}</dd></div>
          {data.ad_size && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Ad size</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{data.ad_size}</dd></div>}
          {data.frequency && <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Frequency</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{data.frequency}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Term</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{day(data.start_date)} to {day(data.end_date)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[color:var(--ds-body)]">Monthly rate</dt><dd className="text-right font-medium text-[color:var(--ds-ink)]">{money(data.rate_cents)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-[color:var(--ds-line)] pt-3"><dt className="font-semibold text-[color:var(--ds-ink)]">Agreement total</dt><dd className="text-right font-semibold text-[color:var(--ds-ink)]">{money(data.total_cents)}</dd></div>
        </dl>
        {data.offer_expires_at && (
          <p className="mt-3 text-xs text-[color:var(--ds-body)]">
            Rate held until {new Date(data.offer_expires_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })} Central.
          </p>
        )}
      </div>

      {data.needs_full_form ? (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">One more step</h2>
          <p className="mt-2 text-sm text-[color:var(--ds-body)]">This renewal includes details we need you to confirm on the full form.</p>
          <a href={data.full_form_url} className={`${pill} mt-4`}>Continue</a>
        </div>
      ) : (
        <div className={card}>
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Payment</h2>
          <div className="mt-3 space-y-2">
            {data.card_on_file && (
              <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'card' ? 'border-[color:var(--ds-ink)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                <input type="radio" name="pay" checked={pay === 'card'} onChange={() => setPay('card')} />
                <span>Card on file ending {data.card_on_file.last4}</span>
              </label>
            )}
            {data.allow_check && (
              <>
                <label className={`flex cursor-pointer items-center gap-3 rounded-[10px] border p-4 text-sm ${pay === 'check' ? 'border-[color:var(--ds-ink)] bg-[color:var(--ds-selected)]' : 'border-[color:var(--ds-line)]'}`}>
                  <input type="radio" name="pay" checked={pay === 'check'} onChange={() => setPay('check')} />
                  <span>Pay by check</span>
                </label>
              </>
            )}
          </div>

          <div className="mt-5 rounded-[10px] border border-[color:var(--ds-line)] p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[color:var(--ds-body)]">Invoices and receipts go to</p>
                <p className="font-medium text-[color:var(--ds-ink)]">{billingEmail || 'No billing email yet'}</p>
              </div>
              <button type="button" onClick={() => setEditBilling((v) => !v)} className="rounded-[10px] border border-[color:var(--ds-primary)] px-3 py-1 text-xs font-medium text-[color:var(--ds-ink)]">
                {editBilling ? 'Done' : 'Change'}
              </button>
            </div>
            {editBilling && (
              <div className="mt-3 space-y-2">
                <input value={billingContact} onChange={(e) => setBillingContact(e.target.value)} placeholder="Billing contact name" className="w-full rounded-[10px] border border-[color:var(--ds-line)] px-3 py-2.5 text-sm" />
                <input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} type="email" placeholder="Billing email" className="w-full rounded-[10px] border border-[color:var(--ds-line)] px-3 py-2.5 text-sm" />
              </div>
            )}
          </div>

          <h2 className="mt-6 text-lg font-semibold text-[color:var(--ds-ink)]">Sign</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name"
            autoComplete="name"
            className="mt-3 w-full rounded-[10px] border border-[color:var(--ds-line)] px-3 py-3 text-base"
            style={{ fontFamily: 'cursive' }}
          />
          <label className="mt-3 flex items-start gap-3 text-sm text-[color:var(--ds-body)]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => setShowTerms((v) => !v)} className="font-medium text-[color:var(--ds-primary)] underline">
                advertising agreement terms
              </button>{' '}
              and authorize this renewal.
            </span>
          </label>
          {showTerms && (
            <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-[color:var(--ds-selected)] p-4 text-xs leading-relaxed text-[color:var(--ds-body)]">{data.terms}</pre>
          )}
          {error && <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="button" onClick={submit} disabled={submitting} className={`${pill} mt-5`}>
            {submitting ? 'Signing…' : 'Sign & renew'}
          </button>
          <p className="mt-3 text-center text-xs text-[color:var(--ds-body)]">
            Need to change the size or schedule?{' '}
            <a href={data.full_form_url} className="font-medium text-[color:var(--ds-primary)] underline">Use the full form</a>
          </p>
        </div>
      )}
    </div>
  );
}
