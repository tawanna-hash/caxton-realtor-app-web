'use client';

import { useState } from 'react';
import { trackGA } from '@/components/SiteGA';

const field = 'mt-1 w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-2.5 text-[16px] text-[#1B1726] focus:border-[#301D5D] focus:outline-none';
const label = 'text-[11px] font-medium uppercase tracking-[0.12em] text-[#5F5B6E]';

export default function SignupForm() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
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
    if (!agree) return setError('Agree to the Terms and Privacy Policy to continue.');
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
          consentText: "I agree to the Closing Time Terms Of Service and Privacy Policy at itsalmostclosingtime.com.",
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
          <a href="/login?next=%2Fagents%2Fclosing-time" className="rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D]">Sign In</a>
        </div>
      </header>
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="font-serif text-3xl text-[#301D5D]">Create A Free Account</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#4A4757]">Your first two active deals are free. No card needed to start.</p>

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
              <span className={label}>Email</span>
              <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" required />
            </label>
            <label className="mt-4 block">
              <span className={label}>Password</span>
              <div className="relative">
                <input className={field + ' pr-16'} type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[12px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] rounded-md" style={{ marginTop: '2px' }}>{show ? 'Hide' : 'Show'}</button>
              </div>
              <span className="mt-1 block text-[12px] text-[#7A7787]">At least 8 characters.</span>
            </label>
            <label className="mt-4 flex items-start gap-2 text-[13px] text-[#4A4757]">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
              <span>I agree to the <a className="text-[#301D5D] underline" href="/terms" target="_blank" rel="noopener">Terms Of Service</a> and <a className="text-[#301D5D] underline" href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span>
            </label>
            {error && <p role="alert" className="mt-4 text-[13px] text-[#ff2a04]" style={{ color: '#661102' }}>{error}</p>}
            <button type="submit" disabled={busy} className="mt-5 w-full rounded-md border border-[#E6E5EC] bg-white px-4 py-2.5 text-[14px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-60">
              {busy ? 'Creating Account…' : 'Create Account'}
            </button>
            <p className="mt-4 text-center text-[13px] text-[#4A4757]">Already have an account? <a className="text-[#301D5D] underline" href="/login?next=%2Fagents%2Fclosing-time">Sign in</a></p>
          </form>
        )}
      </main>
    </div>
  );
}
