'use client';
// Bank account entry for the client payment setup page. The client types their
// routing and account numbers here; Stripe.js sends them straight to Stripe
// (never to our server) and Stripe verifies with microdeposits. No Stripe or
// Link sign-in is involved.
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';

const input = 'w-full rounded-xl border border-[#E2DFEC] px-4 py-3 text-[15px] focus:border-[#301D5D] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#301D5D]/20';
const label = 'mb-1 block text-sm font-semibold text-[#16132D]';

export default function BankAccountForm({ token, brand, defaultName }: { token: string; brand: string; defaultName: string | null }) {
  const [name, setName] = useState(defaultName ?? '');
  const [routing, setRouting] = useState('');
  const [account, setAccount] = useState('');
  const [confirm, setConfirm] = useState('');
  const [holderType, setHolderType] = useState<'company' | 'individual'>('company');
  const [acctType, setAcctType] = useState<'checking' | 'savings'>('checking');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const digits = (s: string) => s.replace(/\D/g, '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Please enter the name on the bank account.');
    if (!/^\d{9}$/.test(routing)) return setErr('The routing number should be 9 digits.');
    if (!/^\d{4,17}$/.test(account)) return setErr('Please check the account number.');
    if (account !== confirm) return setErr('The account numbers do not match.');
    if (!agree) return setErr('Please check the authorization box to continue.');
    setBusy(true);
    try {
      const r = await fetch(`/api/pay/setup/${encodeURIComponent(token)}/bank`, { method: 'POST' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.clientSecret || !j.publishableKey) throw new Error(j.error || 'Secure setup is temporarily unavailable.');
      const stripe = await loadStripe(j.publishableKey);
      if (!stripe) throw new Error('Secure setup could not load. Please refresh and try again.');
      const res = await stripe.confirmUsBankAccountSetup(j.clientSecret, {
        payment_method: {
          us_bank_account: { routing_number: routing, account_number: account, account_holder_type: holderType, account_type: acctType },
          billing_details: { name: name.trim(), ...(j.email ? { email: j.email } : {}) },
        },
      });
      if (res.error) throw new Error(res.error.message || 'We could not save this bank account.');
      window.location.href = `/pay/setup/${encodeURIComponent(token)}?setup_intent=${encodeURIComponent(res.setupIntent.id)}`;
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'We could not save this bank account.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" autoComplete="off">
      <div>
        <label className={label} htmlFor="bk-name">Name on the account</label>
        <input id="bk-name" className={input} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="bk-holder">Account holder</label>
          <select id="bk-holder" className={input} value={holderType} onChange={(e) => setHolderType(e.target.value as 'company' | 'individual')}>
            <option value="company">Business</option>
            <option value="individual">Personal</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="bk-type">Account type</label>
          <select id="bk-type" className={input} value={acctType} onChange={(e) => setAcctType(e.target.value as 'checking' | 'savings')}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>
      <div>
        <label className={label} htmlFor="bk-routing">Routing number</label>
        <input id="bk-routing" className={input} inputMode="numeric" maxLength={9} value={routing} onChange={(e) => setRouting(digits(e.target.value))} />
      </div>
      <div>
        <label className={label} htmlFor="bk-acct">Account number</label>
        <input id="bk-acct" className={input} inputMode="numeric" maxLength={17} value={account} onChange={(e) => setAccount(digits(e.target.value))} />
      </div>
      <div>
        <label className={label} htmlFor="bk-acct2">Confirm account number</label>
        <input id="bk-acct2" className={input} inputMode="numeric" maxLength={17} value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
      </div>
      <label className="flex items-start gap-3 text-xs leading-relaxed text-[#16132D]">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I authorize {brand} to debit this bank account for my advertising payments, according to the amounts and billing schedule I agreed to, and to credit it if needed to correct an error. I can revoke this by contacting {brand}.</span>
      </label>
      {err && <div className="rounded-xl bg-[#FDECEC] px-4 py-3 text-sm text-[#9B1C1C]" role="alert">{err}</div>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#301D5D] px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-[#3D2775] disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#301D5D]/30">{busy ? 'Saving…' : 'Save bank account'}</button>
      <p className="text-xs text-[#4E4B66]">No login needed. Stripe, our payment processor, will send a small deposit to confirm the account in 1–2 business days. {brand} never sees your full account number.</p>
    </form>
  );
}
