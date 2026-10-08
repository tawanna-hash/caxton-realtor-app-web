'use client';

import { useState } from 'react';
import { trackGA } from '@/components/SiteGA';

const field = 'mt-1 w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-2.5 text-[16px] text-[#1B1726] focus:border-[#301D5D] focus:outline-none';
const label = 'text-[11px] font-medium uppercase tracking-[0.12em] text-[#5F5B6E]';

const STATES: Array<[string, string]> = [['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']];

const SMS_CONSENT = 'By providing my phone number and clicking Start Free for REALTORS®, I consent to receive automated text messages (such as alerts and promotional updates) from Closing Time at the number provided. Consent is not a condition of any purchase. Message and data rates may apply. Message frequency varies. I can opt out at any time by replying STOP, or reply HELP for assistance.';

export default function SignupForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [brokerage, setBrokerage] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateCode, setStateCode] = useState('TX');
  const [zip, setZip] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (!name) return setError('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use a password with at least 8 characters.');
    if (!brokerage.trim()) return setError('Enter your brokerage.');
    if (mobile.replace(/\D/g, '').length < 10) return setError('Enter a valid mobile number.');
    if (!address.trim() || !city.trim()) return setError('Enter your street address and city.');
    if (!/^[0-9]{5}(-[0-9]{4})?$/.test(zip.trim())) return setError('Enter a valid zip code.');
    const [firstName, ...rest] = name.split(' ');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName: rest.join(' '),
          email: email.trim(),
          password,
          market: 'austin',
          subscriptions: [],
          brokerage: brokerage.trim(),
          mobile: mobile.trim(),
          mailingAddress: address.trim(),
          city: city.trim(),
          state: stateCode,
          zip: zip.trim(),
          consentText: SMS_CONSENT + ' By creating an account, I agree to the Closing Time Terms Of Service and Privacy Policy at itsalmostclosingtime.com.',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message || data?.error || 'We could not create your account. Please try again.');
        return;
      }
      if (data.autoSignedIn) {
        trackGA('sign_up', { method: 'email' }, () => { window.location.href = '/agents/closing-time'; });
        return;
      }
      trackGA('sign_up', { method: 'email' });
      setDone(data.message || 'Account created. Please sign in.');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-[#1B1726]">
      <header className="border-b border-[#E6E5EC]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="font-serif text-xl text-[#301D5D]">It&rsquo;s Almost Closing Time!</a>
          <a href="/login?next=%2Fagents%2Fclosing-time" className="rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">Log In</a>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-6 py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#7059A8]">Your First Two Deals Are Free</p>
        <h1 className="mt-2 text-[28px] font-semibold text-[#301D5D]">Create Your Account</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#4A4757]">No credit card needed to start.</p>
        <p className="mt-2 text-[12px] leading-relaxed text-[#7A7787]">Two free deals in total, for the life of your account. After that, add a card and $12 is charged when you open a deal; it covers that deal from start to finish. Deals close automatically two weeks after the closing date to protect your file for TREC's 4-year record-keeping rule. If no closing date is entered, the deal closes 180 days after it is opened. You are warned before a deal closes. The first extension is free, then $5 for each extension after that. Opening an archived file after a deal has closed carries a $250 fee.</p>

        {done ? (
          <div role="status" className="mt-6 rounded-xl border border-[#E6E5EC] bg-[#F6F3FB] p-5 text-[14px] text-[#4A4757]">
            <p>{done}</p>
            <a href="/login?next=%2Fagents%2Fclosing-time" className="mt-3 inline-block text-[#301D5D] underline">Go to sign in</a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6" noValidate>
            <label className="block">
              <span className={label}>Full Name</span>
              <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
            </label>
            <label className="mt-4 block">
              <span className={label}>Brokerage</span>
              <input className={field} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} autoComplete="organization" required />
            </label>
            <label className="mt-4 block">
              <span className={label}>Email</span>
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
            </label>
            <label className="mt-4 block">
              <span className={label}>Mobile</span>
              <input className={field} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" inputMode="tel" required />
              <span className="mt-2 block text-[12px] leading-relaxed text-[#7A7787]">By providing your phone number and clicking Start Free for REALTORS®, you consent to receive automated text messages (such as alerts and promotional updates) from Closing Time at the number provided. Consent is not a condition of any purchase. Message and data rates may apply. Message frequency varies. You can opt out at any time by replying STOP, or reply HELP for assistance. See our <a className="text-[#301D5D] underline" href="/sms" target="_blank" rel="noopener">Text Messaging Terms</a>.</span>
            </label>
            <label className="mt-4 block">
              <span className={label}>Street Address</span>
              <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" required />
            </label>
            <div className="mt-4 grid grid-cols-6 gap-3">
              <label className="col-span-6 block sm:col-span-3">
                <span className={label}>City</span>
                <input className={field} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" required />
              </label>
              <label className="col-span-3 block sm:col-span-2">
                <span className={label}>State</span>
                <select className={field} value={stateCode} onChange={(e) => setStateCode(e.target.value)} autoComplete="address-level1" required>
                  {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                </select>
              </label>
              <label className="col-span-3 block sm:col-span-1">
                <span className={label}>Zip Code</span>
                <input className={field} value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?" required />
              </label>
            </div>
            <label className="mt-4 block">
              <span className={label}>Password</span>
              <div className="relative">
                <input className={field + ' pr-16'} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[12px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] rounded-md" style={{ marginTop: '2px' }}>{show ? 'Hide' : 'Show'}</button>
              </div>
              <span className="mt-1 block text-[12px] text-[#7A7787]">At least 8 characters.</span>
            </label>
            {error && <p role="alert" className="mt-4 text-[13px] text-[#ff2a04]" style={{ color: '#661102' }}>{error}</p>}
            <button type="submit" disabled={busy} className="mt-5 w-full rounded-md border border-[#E6E5EC] bg-white px-4 py-2.5 text-[14px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-60">
              {busy ? 'Creating Account…' : 'Start Free for REALTORS®'}
            </button>
            <p className="mt-3 text-[12px] leading-relaxed text-[#7A7787]">By creating an account, you agree to our <a className="text-[#301D5D] underline" href="/terms" target="_blank" rel="noopener">Terms Of Service</a> and <a className="text-[#301D5D] underline" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
            <p className="mt-4 text-center text-[13px] text-[#4A4757]">Already have an account? <a className="text-[#301D5D] underline" href="/login?next=%2Fagents%2Fclosing-time">Log In</a></p>
          </form>
        )}
      </main>
      <footer className="border-t border-[#E6E5EC]">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-6 py-5 text-[12px] text-[#7A7787] sm:flex-row sm:justify-between">
          <span>© 2026 Closing Time. All Rights Reserved</span>
          <span>Not affiliated with the Texas Real Estate Commission or Texas REALTORS®.</span>
        </div>
      </footer>
    </div>
  );
}
