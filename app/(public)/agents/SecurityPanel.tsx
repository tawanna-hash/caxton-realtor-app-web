'use client';

import { useEffect, useState } from 'react';

const BTN = 'inline-flex items-center gap-1.5 rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:opacity-50';
const INPUT = 'w-full max-w-[200px] rounded-md border border-[#E6E5EC] bg-white px-3 py-1.5 text-[14px] text-[#1B1726]';
const API = '/api/auth/two-factor';

export default function SecurityPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void fetch(API, { credentials: 'same-origin' }).then((r) => r.json()).then((d) => setEnabled(Boolean(d.enabled))).catch(() => setEnabled(false)); }, []);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? data?.error ?? 'Something went wrong');
      return data;
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong'); return null; }
    finally { setBusy(false); }
  }

  return (
    <div className="ds-page space-y-6">
      <div>
        <p className="ds-eyebrow">Resources</p>
        <h2 className="ds-title !mt-0">Security</h2>
        <p className="ds-subtitle">Protect your account and see how your data is handled.</p>
      </div>
      <section className="rounded-lg border border-[#E6E5EC] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#1B1726]">Two-Step Sign-In</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">Adds a 6-digit code from an authenticator app such as Google Authenticator, 1Password or Authy to your password sign-in. Once it is on, email links and password reset links no longer sign you in by themselves. You sign in with your password and a code.</p>
        {enabled === null && <p className="mt-3 text-[14px] text-[#7A7787]">Checking.</p>}

        {enabled === false && !setup && !recovery && (
          <div className="mt-3"><button type="button" className={BTN} disabled={busy} onClick={async () => { const d = await post({ action: 'setup' }); if (d) setSetup({ secret: d.secret, qr: d.qr }); }}>Turn On</button></div>
        )}

        {setup && (
          <div className="mt-4 space-y-3 text-[14px] text-[#1B1726]">
            <p>1. Scan this code with your authenticator app.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="Authenticator QR code" width={180} height={180} className="rounded-md border border-[#E6E5EC]" />
            <p className="text-[13px] text-[#7A7787]">Cannot scan? Enter this key instead: <code className="break-all">{setup.secret}</code></p>
            <p>2. Enter the 6-digit code it shows.</p>
            <div className="flex gap-2">
              <input className={INPUT} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
              <button type="button" className={BTN} disabled={busy || code.trim().length !== 6} onClick={async () => { const d = await post({ action: 'enable', code }); if (d) { setRecovery(d.recoveryCodes); setEnabled(true); setSetup(null); setCode(''); } }}>Confirm</button>
            </div>
          </div>
        )}

        {recovery && (
          <div role="alert" className="mt-4 rounded-md border border-[#E6E5EC] bg-[#F6F3FB] p-4 text-[14px] text-[#1B1726]">
            <p className="font-semibold">Save these recovery codes</p>
            <p className="mt-1 text-[#4A4757]">Each works once if you lose your phone. They are shown only now.</p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[13px] sm:grid-cols-4">{recovery.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className="mt-3 flex gap-2">
              <button type="button" className={BTN} onClick={() => void navigator.clipboard?.writeText(recovery.join('\n'))}>Copy</button>
              <button type="button" className={BTN} onClick={() => setRecovery(null)}>I Saved Them</button>
            </div>
          </div>
        )}

        {enabled && !recovery && (
          <div className="mt-4 space-y-2 text-[14px] text-[#1B1726]">
            <p className="text-[#005A00]">Two-step sign-in is on.</p>
            <div className="flex flex-wrap gap-2">
              <input className={INPUT} placeholder="Code To Turn Off" value={code} onChange={(e) => setCode(e.target.value)} />
              <button type="button" className={BTN} disabled={busy || code.trim().length < 6} onClick={async () => { const d = await post({ action: 'disable', code }); if (d) { setEnabled(false); setCode(''); } }}>Turn Off</button>
            </div>
          </div>
        )}
        {msg && <p role="status" className="mt-3 text-[14px] text-[#661102]">{msg}</p>}
      </section>

      <section className="rounded-lg border border-[#E6E5EC] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#1B1726]">Security Practices</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">See what is in place today and what is not yet claimed on the <a className="underline text-[#301D5D]" href="/security">Security page</a>.</p>
      </section>
    </div>
  );
}
