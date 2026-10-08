'use client';

import { useState } from 'react';
import { trackGA } from '@/components/SiteGA';

const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', height: 46, padding: '0 14px', fontFamily: 'inherit', fontSize: 16, color: '#1C1038', background: '#FFFFFF', border: '1px solid #B9C0C9', borderRadius: 3 };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 600, color: '#1C1038', marginBottom: 6 };

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
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#1C1038', background: '#F5F6F8', width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .ct-su input:focus, .ct-su select:focus { outline: 2px solid #5B3FA8; outline-offset: 1px; }
        .ct-su a { color: #301D5D; } .ct-su a:hover { color: #1C1038; }
        @media (max-width: 760px) { .ct-su-section { padding-left: 20px !important; padding-right: 20px !important; } .ct-su-card { padding: 28px 20px !important; } }
      `}</style>
      <nav aria-label="Main" style={{ background: '#FFFFFF', borderBottom: '1px solid #DDE1E6' }}>
        <div className="ct-su-section" style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1C1038', textDecoration: 'none' }}>
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="#5B3FA8" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="16" cy="16" r="13" /><path d="M16 8v8l5.5 3.5" /></svg>
            <span style={{ fontWeight: 700, fontSize: 20 }}>Closing Time</span>
          </a>
          <a href="/login?next=%2Fagents%2Fclosing-time" style={{ color: '#1C1038', textDecoration: 'none', fontWeight: 500, fontSize: 15, padding: '11px 14px' }}>Log In</a>
        </div>
      </nav>

      <main className="ct-su-section ct-su" style={{ flex: 1, width: '100%', maxWidth: 620, margin: '0 auto', padding: '56px 40px 80px', boxSizing: 'border-box' }}>
        <div className="ct-su-card" style={{ background: '#FFFFFF', border: '1px solid #DDE1E6', borderRadius: 4, padding: 40 }}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#5B3FA8' }}>Your First Two Deals Are Free</p>
          <h1 style={{ margin: 0, fontWeight: 700, fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.015em' }}>Create Your Account</h1>
          <p style={{ margin: '10px 0 28px', fontSize: 16, lineHeight: 1.6, color: '#4A5563' }}>No credit card needed to start.</p>
          {done ? (
            <div role="status" style={{ fontSize: 16, lineHeight: 1.6, color: '#4A5563' }}>
              <p style={{ margin: 0 }}>{done}</p>
              <a href="/login?next=%2Fagents%2Fclosing-time" style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}>Go to Log In</a>
            </div>
          ) : (
            <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label htmlFor="name" style={labelStyle}>Full Name</label>
                <input id="name" name="name" type="text" autoComplete="name" required style={fieldStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="brokerage" style={labelStyle}>Brokerage</label>
                <input id="brokerage" name="brokerage" type="text" autoComplete="organization" required style={fieldStyle} value={brokerage} onChange={(e) => setBrokerage(e.target.value)} />
              </div>
              <div>
                <label htmlFor="email" style={labelStyle}>Email</label>
                <input id="email" name="email" type="email" autoComplete="email" required style={fieldStyle} value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label htmlFor="mobile" style={labelStyle}>Mobile</label>
                <input id="mobile" name="mobile" type="tel" autoComplete="tel" required style={fieldStyle} value={mobile} onChange={(e) => setMobile(e.target.value)} />
                <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.55, color: '#4A5563' }}>By providing your phone number and clicking Start Free for REALTORS®, you consent to receive automated text messages (such as alerts and promotional updates) from Closing Time at the number provided. Consent is not a condition of any purchase. Message and data rates may apply. Message frequency varies. You can opt out at any time by replying STOP, or reply HELP for assistance. See our <a href="/sms" target="_blank" rel="noopener">Text Messaging Terms</a>.</p>
              </div>
              <div>
                <label htmlFor="address" style={labelStyle}>Street Address</label>
                <input id="address" name="address" type="text" autoComplete="street-address" required style={fieldStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <div style={{ flex: '2 1 200px', minWidth: 0 }}>
                  <label htmlFor="city" style={labelStyle}>City</label>
                  <input id="city" name="city" type="text" autoComplete="address-level2" required style={fieldStyle} value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                  <label htmlFor="state" style={labelStyle}>State</label>
                  <select id="state" name="state" autoComplete="address-level1" required style={fieldStyle} value={stateCode} onChange={(e) => setStateCode(e.target.value)}>
                    {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                  </select>
                </div>
                <div style={{ flex: '1 1 110px', minWidth: 0 }}>
                  <label htmlFor="zip" style={labelStyle}>Zip Code</label>
                  <input id="zip" name="zip" type="text" inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}(-[0-9]{4})?" required style={fieldStyle} value={zip} onChange={(e) => setZip(e.target.value)} />
                </div>
              </div>
              <div>
                <label htmlFor="password" style={labelStyle}>Password</label>
                <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-describedby="password-hint" style={fieldStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
                <p id="password-hint" style={{ margin: '8px 0 0', fontSize: 13, color: '#6B7280' }}>At least 8 characters.</p>
              </div>
              {error && <p role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#661102' }}>{error}</p>}
              <button type="submit" disabled={busy} style={{ marginTop: 6, height: 50, fontFamily: 'inherit', fontSize: 16, fontWeight: 600, color: '#FFFFFF', background: '#301D5D', border: 0, borderRadius: 3, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating Account…' : 'Start Free for REALTORS®'}</button>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#6B7280', textAlign: 'center' }}>By creating an account, you agree to our <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>
            </form>
          )}
        </div>
        <p style={{ margin: '20px 0 0', fontSize: 15, textAlign: 'center', color: '#4A5563' }}>Already have an account? <a href="/login?next=%2Fagents%2Fclosing-time" style={{ fontWeight: 600 }}>Log In</a></p>
      </main>

      <footer style={{ background: '#FFFFFF', borderTop: '1px solid #DDE1E6' }}>
        <div className="ct-su-section" style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 40px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, fontSize: '8pt', color: '#4A5563' }}>
          <span>© 2026 Closing Time. All Rights Reserved</span>
          <span>Not affiliated with the Texas Real Estate Commission or Texas REALTORS®.</span>
        </div>
      </footer>
    </div>
  );
}
