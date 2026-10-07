'use client';

import { useEffect, useState } from 'react';

// Blocks Closing Time until the signed-in agent agrees to the current Terms, Privacy Policy and Important Notices.
// Fails open if the check cannot be reached so a network problem never locks an agent out of their deals.
export default function LegalGate() {
  const [needed, setNeeded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch('/api/closing-time/legal', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live && d && d.accepted === false) setNeeded(true); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!needed) return null;

  async function agree() {
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/closing-time/legal', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }),
      });
      if (!r.ok) throw new Error();
      setNeeded(false);
    } catch {
      setError('Could not save your agreement. Please try again.');
    } finally { setSaving(false); }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="legal-gate-title" className="fixed inset-0 z-[100] flex items-center justify-center bg-[#1B1726]/50 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#E6E5EC] bg-white p-6 shadow-lg">
        <h2 id="legal-gate-title" className="font-serif text-2xl text-[#301D5D]">Before You Continue</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#4A4757]">
          Closing Time helps you stay organized. You remain responsible for every deadline, form and message in your transactions. Please review:
        </p>
        <ul className="mt-3 space-y-1 text-[14px]">
          <li><a className="text-[#301D5D] underline" href="/terms" target="_blank" rel="noopener noreferrer">Terms Of Service</a>, including the limit of liability and release</li>
          <li><a className="text-[#301D5D] underline" href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a></li>
          <li><a className="text-[#301D5D] underline" href="/disclaimer" target="_blank" rel="noopener noreferrer">Important Notices</a></li>
        </ul>
        <label className="mt-4 flex items-start gap-2 text-[14px] text-[#1B1726]">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#301D5D]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>I have read and agree to the Terms Of Service, Privacy Policy and Important Notices, including the release of liability.</span>
        </label>
        {error && <p role="alert" className="mt-3 text-[13px] text-[#ff2a04]">{error}</p>}
        <button
          type="button" disabled={!checked || saving} onClick={agree}
          className="mt-5 w-full rounded-md border border-[#E6E5EC] bg-white px-3 py-2 text-[13px] font-medium text-[#301D5D] hover:!bg-[#EFEAF8] hover:!text-[#301D5D] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving' : 'Agree And Continue'}
        </button>
      </div>
    </div>
  );
}
